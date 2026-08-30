// Repairs the closed candles an outage lost.
//
// Everything here is deliberately built out of paths that already exist:
//
//   which candles are missing -> missingClosedIntervals (pure, MKT-09)
//   where to get them         -> MarketDataProvider.fetchHistorical (MKT-02)
//   how to store them         -> the append-only candle writer (MKT-01)
//
// That is what makes a recovered candle indistinguishable from a live one. A
// separate recovery table or a second write path would break the append-only
// revision rule that dataset snapshots depend on, so there is none.

import type { Candle, Timeframe } from "../domain/candle.js";
import type { MarketDataProvider } from "./market-data-provider.js";
import { lastClosedOpenTime, missingClosedIntervals } from "./missing-intervals.js";

const CONTEXT = "MarketIngest";

/**
 * Bound on one recovery call.
 *
 * `missingClosedIntervals` already caps a single pass at one provider page, so
 * this caps how many pages one call chains. Ten passes is 10,000 candles, far
 * more than any realistic outage of a subscribed stream, and it guarantees the
 * loop ends even if the provider keeps answering with data that never advances
 * the stored boundary.
 */
export const MAX_RECOVERY_PASSES = 10;

/** Reads the lower boundary recovery starts from. Implemented by the candle repository. */
export interface CommittedCandleBoundaryQuery {
  getLatestCommittedOpenTime(request: {
    readonly provider: string;
    readonly symbol: string;
    readonly timeframe: Timeframe;
  }): Promise<number | undefined>;
}

/** The same append-only writer historical backfill uses. */
export interface RecoveryCandleWriter {
  appendMany(candles: readonly Candle[]): Promise<readonly Candle[]>;
}

export interface RecoveryLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
}

export interface GapRecoveryRequest {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
}

export interface GapRecoveryOutcome {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  /** How many closed intervals were found missing across every pass. */
  readonly missing: number;
  /** How many candles the provider actually returned and the writer stored. */
  readonly recovered: number;
  /** First and last recovered open time, or `undefined` when there was no gap. */
  readonly startTime: number | undefined;
  readonly endTime: number | undefined;
  /**
   * True when a known gap still remains after this call: the provider returned
   * nothing for a range it was asked about, or the pass limit was reached.
   */
  readonly incomplete: boolean;
}

export class MarketGapRecoveryService {
  constructor(
    private readonly provider: MarketDataProvider,
    private readonly boundary: CommittedCandleBoundaryQuery,
    private readonly writer: RecoveryCandleWriter,
    private readonly logger: RecoveryLogger,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Fetches and stores every closed candle missing for one stream.
   *
   * Returns only after the durable write has returned. Nothing may report
   * recovery as finished before that, because a notification about a candle
   * that is not stored is exactly the loss this slice exists to prevent.
   */
  async recover(request: GapRecoveryRequest): Promise<GapRecoveryOutcome> {
    const stream = `${request.symbol} ${request.timeframe}`;
    let missing = 0;
    let recovered = 0;
    let startTime: number | undefined;
    let endTime: number | undefined;
    let incomplete = false;

    for (let pass = 0; pass < MAX_RECOVERY_PASSES; pass += 1) {
      const lastCommittedOpenTime = await this.boundary.getLatestCommittedOpenTime(request);
      const gap = missingClosedIntervals({
        timeframe: request.timeframe,
        lastCommittedOpenTime,
        throughOpenTime: lastClosedOpenTime(this.now(), request.timeframe)
      });
      if (gap.startTime === undefined || gap.endTime === undefined) break;

      missing += gap.openTimes.length;
      startTime ??= gap.startTime;
      this.logger.log(
        `Recovering ${gap.openTimes.length} missing ${stream} candles ` +
          `from ${gap.startTime} to ${gap.endTime}`,
        CONTEXT
      );

      const candles = await this.provider.fetchHistorical({
        symbol: request.symbol,
        timeframe: request.timeframe,
        startTime: gap.startTime,
        endTime: gap.endTime
      });
      if (candles.length === 0) {
        // The provider has nothing for a range it was asked about. Repeating
        // the same request would loop, so stop and report the gap as unresolved.
        this.logger.warn(
          `Provider returned no candles for the ${stream} gap ${gap.startTime}..${gap.endTime}`,
          CONTEXT
        );
        incomplete = true;
        break;
      }

      const stored = await this.writer.appendMany(candles);
      recovered += stored.length;
      endTime = stored.at(-1)?.openTime ?? gap.endTime;

      if (!gap.truncated) break;
      if (pass === MAX_RECOVERY_PASSES - 1) incomplete = true;
    }

    if (missing > 0) {
      this.logger.log(
        `Recovered ${recovered} of ${missing} missing ${stream} candles`,
        CONTEXT
      );
    }
    return {
      ...request,
      missing,
      recovered,
      startTime,
      endTime,
      incomplete: incomplete || recovered < missing
    };
  }
}
