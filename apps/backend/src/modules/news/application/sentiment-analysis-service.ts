// The analyzer stage: claim pending items, infer, and commit or record a failure.
//
// This stage is one of two independent stages in the news worker. It reaches the
// collector through nothing at all; both stages meet only in durable state. It also
// names no model: the analyzer behind the port supplies its own provenance.

import {
  NEWS_SENTIMENT_INPUT_VERSION,
  SENTIMENT_RESULT_SCHEMA_VERSION,
  normalizeSentimentResult,
  type SentimentResult
} from "../domain/sentiment-result.js";
import type { ClaimedNewsItem, SentimentAnalysisStore } from "./sentiment-analysis-store.js";
import type { SentimentAnalyzer } from "./sentiment-analyzer.js";

export interface SentimentAnalysisLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

/** Bounded retry policy. These are configuration values, never domain constants. */
export interface SentimentAnalysisPolicy {
  readonly maxAttempts: number;
  readonly batchSize: number;
}

export interface SentimentAnalysisRunResult {
  readonly analyzerId: string;
  readonly claimedCount: number;
  readonly analyzedCount: number;
  /** Failures that still have attempts left; the item returns to `pending`. */
  readonly retryableFailureCount: number;
  /** Failures that exhausted the retry bound; the item becomes visibly `degraded`. */
  readonly degradedCount: number;
  /** Claims another stage took over before this one could finish. */
  readonly lostClaimCount: number;
}

const CONTEXT = "SentimentAnalysis";

export class SentimentAnalysisService {
  constructor(
    private readonly analyzer: SentimentAnalyzer,
    private readonly store: SentimentAnalysisStore,
    private readonly policy: SentimentAnalysisPolicy,
    private readonly analyzerId: string,
    private readonly logger: SentimentAnalysisLogger,
    private readonly now: () => number = Date.now
  ) {}

  /** Runs one bounded batch. Never throws for an inference failure. */
  async analyzeNextBatch(): Promise<SentimentAnalysisRunResult> {
    const claims = await this.store.claimPendingItems(this.analyzerId, this.policy.batchSize);
    let analyzed = 0;
    let retryable = 0;
    let degraded = 0;
    let lost = 0;

    for (const claim of claims) {
      const outcome = await this.analyzeOne(claim);
      if (outcome === "analyzed") analyzed += 1;
      else if (outcome === "pending") retryable += 1;
      else if (outcome === "degraded") degraded += 1;
      else lost += 1;
    }

    const result: SentimentAnalysisRunResult = {
      analyzerId: this.analyzerId,
      claimedCount: claims.length,
      analyzedCount: analyzed,
      retryableFailureCount: retryable,
      degradedCount: degraded,
      lostClaimCount: lost
    };
    this.logger.log(
      `Analyzed ${analyzed} of ${claims.length} claimed item(s); ` +
        `${retryable} retryable, ${degraded} degraded, ${lost} lost claim(s).`,
      CONTEXT
    );
    return result;
  }

  private async analyzeOne(
    claim: ClaimedNewsItem
  ): Promise<"analyzed" | "pending" | "degraded" | "lost"> {
    const renewal = this.startLeaseRenewal(claim);
    let result: SentimentResult;
    try {
      result = await this.infer(claim);
    } catch (error: unknown) {
      renewal.stop();
      if (renewal.ownershipLost()) return "lost";
      return this.recordFailure(claim, this.reasonFor(error));
    }

    try {
      renewal.stop();
      if (renewal.ownershipLost()) return "lost";
      await this.store.commitResult(claim, result);
      return "analyzed";
    } catch (error: unknown) {
      const reason = this.reasonFor(error);
      if (reason.startsWith("NEWS_ANALYSIS_CLAIM_LOST")) {
        this.logger.warn(`Claim for ${claim.item.id} was taken over: ${reason}`, CONTEXT);
        return "lost";
      }
      return this.recordFailure(claim, `NEWS_ANALYSIS_RESULT_NOT_STORED: ${reason}`);
    }
  }

  /**
   * Keeps the durable claim alive while inference runs outside any database
   * transaction. A lost renewal fences this stage from result/failure writes;
   * a process crash after an external request remains an unavoidable at-least-once
   * boundary and is recorded as a later retry rather than claimed exactly-once.
   */
  private startLeaseRenewal(claim: ClaimedNewsItem): {
    stop(): void;
    ownershipLost(): boolean;
  } {
    let timer: NodeJS.Timeout | undefined;
    let active = true;
    let lost = false;

    const schedule = (leaseExpiresAt: string): void => {
      const remainingMs = Date.parse(leaseExpiresAt) - Date.now();
      const delayMs = Math.max(1, Math.floor(Math.max(1, remainingMs) / 2));
      timer = setTimeout(() => { void renew(); }, delayMs);
      timer.unref();
    };
    const renew = async (): Promise<void> => {
      timer = undefined;
      if (!active) return;
      try {
        const renewed = await this.store.renewLease(claim);
        if (renewed === undefined) {
          lost = true;
          this.logger.warn(`Claim for ${claim.item.id} was lost during lease renewal.`, CONTEXT);
          return;
        }
        schedule(renewed.leaseExpiresAt);
      } catch (error: unknown) {
        lost = true;
        this.logger.warn(
          `Claim for ${claim.item.id} could not renew: ${this.reasonFor(error)}`,
          CONTEXT
        );
      }
    };

    schedule(claim.leaseExpiresAt);
    return {
      stop: () => {
        active = false;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      },
      ownershipLost: () => lost
    };
  }

  private async infer(claim: ClaimedNewsItem): Promise<SentimentResult> {
    const output = await this.analyzer.analyze({
      item: claim.item,
      inputVersion: NEWS_SENTIMENT_INPUT_VERSION
    });
    const normalized = normalizeSentimentResult({
      schemaVersion: SENTIMENT_RESULT_SCHEMA_VERSION,
      newsItemId: claim.item.id,
      label: output.label,
      score: output.score,
      model: output.model,
      analyzedAt: this.now(),
      status: "succeeded"
    });
    if (normalized.kind === "rejected") {
      throw new Error(`INVALID_ANALYZER_RESULT: ${normalized.reason}`);
    }
    if (normalized.result.model.inputVersion !== NEWS_SENTIMENT_INPUT_VERSION) {
      throw new Error("INVALID_ANALYZER_RESULT: recorded input version does not match the request");
    }
    return normalized.result;
  }

  /** Applies the bounded retry policy: the last allowed attempt ends in `degraded`. */
  private async recordFailure(
    claim: ClaimedNewsItem,
    reason: string
  ): Promise<"pending" | "degraded" | "lost"> {
    const nextState = claim.attempt >= this.policy.maxAttempts ? "degraded" : "pending";
    try {
      await this.store.recordFailure(claim, { reason, nextState });
    } catch (error: unknown) {
      this.logger.warn(
        `Failure for ${claim.item.id} could not be recorded: ${this.reasonFor(error)}`,
        CONTEXT
      );
      return "lost";
    }
    const message =
      `Inference attempt ${claim.attempt} of ${this.policy.maxAttempts} failed for ` +
      `${claim.item.id}: ${reason}`;
    if (nextState === "degraded") {
      this.logger.error(`${message}. Item is now degraded.`, CONTEXT);
    } else {
      this.logger.warn(`${message}. Item stays retryable.`, CONTEXT);
    }
    return nextState;
  }

  private reasonFor(error: unknown): string {
    if (error instanceof Error) {
      const code = (error as { code?: unknown }).code;
      return typeof code === "string" ? `${code}: ${error.message}` : error.message;
    }
    return "unknown inference failure";
  }
}

export interface SentimentAnalysisTimer {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemTimer: SentimentAnalysisTimer = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
};

const silentSchedulerLogger: SentimentAnalysisLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function schedulerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown scheduled analysis failure";
}

/** Offers explicit manual analysis and a single non-overlapping timer registration. */
export class SentimentAnalysisScheduler {
  private handle: unknown | undefined;
  private scheduledRun: Promise<void> | undefined;

  constructor(
    private readonly stage: SentimentAnalysisService,
    private readonly pollIntervalMs: number,
    private readonly timer: SentimentAnalysisTimer = systemTimer,
    private readonly logger: SentimentAnalysisLogger = silentSchedulerLogger
  ) {}

  async analyzeManually(): Promise<SentimentAnalysisRunResult> {
    return this.stage.analyzeNextBatch();
  }

  async analyzeOnSchedule(): Promise<SentimentAnalysisRunResult> {
    return this.stage.analyzeNextBatch();
  }

  start(): void {
    if (this.handle !== undefined) return;
    this.handle = this.timer.setInterval(() => this.triggerScheduledAnalysis(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.handle === undefined) return;
    this.timer.clearInterval(this.handle);
    this.handle = undefined;
  }

  private triggerScheduledAnalysis(): void {
    if (this.handle === undefined || this.scheduledRun !== undefined) return;
    this.scheduledRun = this.analyzeOnSchedule()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(`Scheduled analysis failed: ${schedulerErrorMessage(error)}`, CONTEXT);
      })
      .finally(() => {
        this.scheduledRun = undefined;
      });
  }
}
