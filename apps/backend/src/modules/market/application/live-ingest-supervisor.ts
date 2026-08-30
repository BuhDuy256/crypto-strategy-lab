// Connection lifetime around live ingest.
//
// `MarketLiveIngestService` handles one connection generation: it consumes the
// streams it was given and returns when they end. What "they ended" means -
// provider disconnect, degraded health, reconnect with backoff, gap recovery -
// is a lifetime concern, and it lives here so the candle path stays free of it.
//
// Binance disconnects every connection at the 24-hour mark, so this is a normal
// operating path, not only a failure path.

import type { GapRecoveryOutcome } from "./market-gap-recovery-service.js";
import type { LiveCandlesRequest } from "./market-data-provider.js";
import type { MarketIngestLogger, MarketLiveIngestService } from "./market-live-ingest-service.js";
import type { ProviderHealthTracker } from "./provider-health.js";
import { reconnectDelayMs, type ReconnectBackoffOptions } from "./reconnect-backoff.js";

const CONTEXT = "MarketIngest";

/**
 * Waits `delayMs`, or returns early when the caller aborts.
 *
 * Clearing the timer matters: a process asked to stop during a 30-second
 * backoff must not be held open by the timer that is no longer needed.
 */
function abortableSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    // `done` reads `timer` only when it runs, which is always after the timer
    // below has been created, so the order of these two declarations is safe.
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, delayMs);
    signal.addEventListener("abort", done, { once: true });
  });
}

export interface LiveIngestSupervisorOptions {
  readonly backoff?: ReconnectBackoffOptions;
  /** Injected so tests assert the schedule instead of waiting for it. */
  readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  /**
   * Repairs the candles one stream missed, already bound to a provider.
   *
   * A callback rather than the service itself, because the supervisor holds
   * `LiveCandlesRequest` values that carry no provider: binding the provider id
   * where the service is constructed keeps that detail out of the lifetime
   * logic. Omitted only by tests that do not exercise recovery.
   */
  readonly recover?: (stream: LiveCandlesRequest) => Promise<GapRecoveryOutcome>;
}

export class LiveIngestSupervisor {
  private readonly backoffOptions: ReconnectBackoffOptions;
  private readonly sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
  private readonly recover: ((stream: LiveCandlesRequest) => Promise<GapRecoveryOutcome>) | undefined;
  private attempt = 0;
  private reconnectCount = 0;
  private recoveredCount = 0;

  constructor(
    private readonly ingest: MarketLiveIngestService,
    private readonly health: ProviderHealthTracker,
    private readonly streams: readonly LiveCandlesRequest[],
    private readonly logger: MarketIngestLogger,
    options: LiveIngestSupervisorOptions = {}
  ) {
    this.backoffOptions = options.backoff ?? {};
    this.sleep = options.sleep ?? abortableSleep;
    this.recover = options.recover;
  }

  /** Connections opened after the first one. Evidence that reconnect ran. */
  get reconnects(): number {
    return this.reconnectCount;
  }

  /** Attempt number the next reconnect delay was computed from. Zero before the first. */
  get currentAttempt(): number {
    return this.attempt;
  }

  /** Candles recovered over REST across every cycle. Evidence that repair ran. */
  get recoveredCandles(): number {
    return this.recoveredCount;
  }

  /**
   * Runs live ingest until the caller aborts, reconnecting with backoff in
   * between.
   *
   * A generation that ends on its own is a provider disconnect: the stream
   * registry ends every queue when the socket closes, so the ingest service
   * returns. An abort ends the same way, which is why the abort flag, and not
   * the fact that the call returned, decides whether health degrades.
   */
  async run(signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted) {
        // The generation is started first and awaited last so recovery runs
        // while the reconnected stream is already delivering. An interval that
        // closes inside that window is then either delivered live or fetched
        // over REST, and the append-only compare makes the overlap harmless.
        // Starting the socket only after recovery finished would leave exactly
        // that window unwatched.
        const routedBefore = this.ingest.routedCandles;
        const generation = this.runGeneration(signal);
        await this.recoverStreams(signal);
        const failure = await generation;
        if (signal.aborted) break;
        // "The reconnect worked" means this generation carried candles, which
        // is asked of the ingest counter rather than of health: an unresolved
        // gap keeps health degraded on a connection that is otherwise fine, and
        // that must not make the backoff keep growing.
        const delivered = this.ingest.routedCandles > routedBefore;
        this.degrade(failure);
        this.attempt = delivered ? 1 : this.attempt + 1;
        const delay = reconnectDelayMs(this.attempt, this.backoffOptions);
        this.logger.warn(
          `Reconnecting to the provider in ${delay} ms (attempt ${this.attempt})`,
          CONTEXT
        );
        await this.sleep(delay, signal);
        if (signal.aborted) break;
        this.reconnectCount += 1;
      }
    } finally {
      await this.ingest.settleTicks();
      await this.health.settle();
    }
  }

  /**
   * Repairs every stream this supervisor holds, keeping health down until it is
   * done.
   *
   * The hold is the point. A reconnected socket starts delivering immediately,
   * and one live candle would otherwise report healthy while the outage candles
   * are still missing. Health is released only when every stream came back with
   * no gap left, so a failed or partial recovery cannot look like success.
   *
   * A gap that survives this call is not lost work. The boundary recovery
   * starts from is read from storage every time, so the next cycle recomputes
   * it and continues from whatever is durably there.
   */
  private async recoverStreams(signal: AbortSignal): Promise<void> {
    const recover = this.recover;
    if (recover === undefined) return;
    this.health.markRecovering("recovering the closed candles the outage missed");
    let complete = true;
    for (const stream of this.streams) {
      if (signal.aborted) return;
      const name = `${stream.symbol} ${stream.timeframe}`;
      try {
        const outcome = await recover(stream);
        this.recoveredCount += outcome.recovered;
        if (outcome.incomplete) complete = false;
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "unknown recovery failure";
        this.logger.error(`Gap recovery failed for ${name}: ${reason}`, CONTEXT);
        complete = false;
      }
    }
    if (signal.aborted) return;
    if (complete) {
      this.health.finishRecovery();
      return;
    }
    this.health.markDegraded("a known gap remains after recovery");
  }

  /** Runs one connection generation and reports why it ended. */
  private async runGeneration(signal: AbortSignal): Promise<string> {
    try {
      await this.ingest.run(this.streams, signal);
      return "the provider closed the stream";
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "unknown stream failure";
      return `the provider stream failed: ${reason}`;
    }
  }

  private degrade(reason: string): void {
    this.logger.warn(`Live ingest lost its provider connection: ${reason}`, CONTEXT);
    this.health.markDegraded(reason);
  }
}
