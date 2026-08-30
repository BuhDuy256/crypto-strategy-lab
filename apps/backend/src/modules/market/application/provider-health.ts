// Provider health as Market Data's own state.
//
// Health is not a property of the exchange adapter, it is what Market Data
// currently believes about its live connection. Ingest holds the connection and
// is the only writer; the API only reads. Those are separate processes and
// Redis is explicitly ephemeral, so the shared record is PostgreSQL.

import type { Candle } from "../domain/candle.js";
import type { ProviderHealth, ProviderHealthStatus } from "./market-data-provider.js";

/** Write side. Ingest owns it. */
export interface ProviderHealthStore {
  /**
   * Records the current state for one provider.
   *
   * `changedAt` moves only when the status differs from the stored one, so a
   * repeated report of the same status keeps the moment the outage started.
   */
  record(state: ProviderHealthRecord): Promise<void>;
}

/** Read side. Exposed through the module surface so the API can answer a query. */
export interface ProviderHealthQuery {
  /** Current state, or `undefined` when ingest has never reported. */
  getHealth(provider: string): Promise<ProviderHealth | undefined>;
}

export interface ProviderHealthRecord {
  readonly provider: string;
  readonly status: ProviderHealthStatus;
  readonly reason: string | undefined;
  readonly checkedAt: number;
}

export interface ProviderHealthLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
}

const CONTEXT = "MarketIngest";

/**
 * Turns live-stream events into recorded health transitions.
 *
 * Two properties matter and both come from keeping the current status in
 * memory. First, `onLiveCandle` runs once per tick, roughly once a second per
 * stream, so it must cost a comparison and nothing else while the connection is
 * fine. Second, a health write must never delay or fail the candle path, so
 * writes are fired on a serial chain and a failure is logged, not thrown.
 */
export class ProviderHealthTracker implements LiveStreamObserver {
  private current: ProviderHealthStatus | undefined;
  private currentReason: string | undefined;
  private holding = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly provider: string,
    private readonly store: ProviderHealthStore,
    private readonly logger: ProviderHealthLogger,
    private readonly now: () => number = Date.now
  ) {}

  /** Current status as this process last recorded it. For tests and for logs. */
  get status(): ProviderHealthStatus | undefined {
    return this.current;
  }

  /** True while recovery holds health down. For tests and for logs. */
  get recovering(): boolean {
    return this.holding;
  }

  /**
   * A candle is the only proof the connection actually works, so it, and not a
   * socket that merely opened, is what clears a degraded state.
   *
   * The hold matters because a reconnected stream starts delivering while the
   * candles the outage lost are still being recovered. Without it one live tick
   * would report healthy over an unresolved gap, which is exactly the false
   * "everything is fine" this slice exists to prevent.
   */
  onLiveCandle(): void {
    if (this.holding || this.current === "healthy") return;
    this.markHealthy();
  }

  /**
   * Holds health down while recovery runs, and says why.
   *
   * The existing status model has no separate "recovering" value, so recovery
   * is `degraded` with its own reason. That is a state an operator can read and
   * a client can display without inventing a new vocabulary.
   */
  markRecovering(reason: string): void {
    this.holding = true;
    this.transition("degraded", reason);
  }

  /**
   * Releases the hold after recovery finished with no gap left behind.
   *
   * It does not declare health itself: the next live candle does. A stream that
   * recovered but then delivers nothing is not healthy, and this keeps that
   * distinction honest.
   */
  finishRecovery(): void {
    this.holding = false;
  }

  markHealthy(): void {
    this.transition("healthy", undefined);
  }

  markDegraded(reason: string): void {
    this.transition("degraded", reason);
  }

  markUnavailable(reason: string): void {
    this.transition("unavailable", reason);
  }

  /** Waits for pending health writes. For tests and for a clean shutdown. */
  async settle(): Promise<void> {
    await this.chain;
  }

  private transition(status: ProviderHealthStatus, reason: string | undefined): void {
    if (this.current === status && this.currentReason === reason) return;
    this.current = status;
    this.currentReason = reason;
    this.logger.log(
      `Provider ${this.provider} health is ${status}${reason === undefined ? "" : `: ${reason}`}`,
      CONTEXT
    );
    const record: ProviderHealthRecord = {
      provider: this.provider,
      status,
      reason,
      checkedAt: this.now()
    };
    this.chain = this.chain
      .then(async () => this.store.record(record))
      .catch((error: unknown) => {
        const failure = error instanceof Error ? error.message : "unknown health write failure";
        this.logger.warn(`Provider health write failed for ${status}: ${failure}`, CONTEXT);
      });
  }
}

/** Observer the live ingest service calls for every candle it routes. */
export interface LiveStreamObserver {
  onLiveCandle(candle: Candle): void;
}
