// Which closed intervals an outage actually lost.
//
// This is deliberately pure: no provider call, no database, no clock of its
// own. Gap arithmetic is the part of recovery that is easy to get wrong at the
// two boundaries, and keeping it free of I/O is what makes every boundary case
// cheap to test.
//
// The rule that decides every boundary: a candle is missing only if its whole
// interval already ended. The interval that contains "now" is still forming, is
// not a closed candle, and is never recovered - live ingest will commit it when
// the provider closes it.

import { timeframeDurationMs, type Timeframe } from "../domain/candle.js";

/**
 * Upper bound on one recovery pass.
 *
 * It equals Binance's maximum kline page, so a pass is at most one REST page
 * per stream. A longer outage is recovered by repeating the pass, which is
 * exactly what makes recovery resumable rather than one unbounded request.
 */
export const MAX_RECOVERY_INTERVALS = 1000;

export interface MissingIntervalsRequest {
  readonly timeframe: Timeframe;
  /**
   * Open time of the last closed candle already committed, or `undefined` when
   * nothing has ever been committed for this stream.
   *
   * `undefined` yields no gap on purpose: with no known last candle there is no
   * known gap either, and repairing a range that was never subscribed is
   * outside this slice.
   */
  readonly lastCommittedOpenTime: number | undefined;
  /**
   * Open time of the newest interval that is already closed, inclusive.
   *
   * Callers usually derive it with `lastClosedOpenTime(now, timeframe)` at the
   * moment the stream resumes, or use the open time of the first closed candle
   * the resumed stream delivered, minus one interval.
   */
  readonly throughOpenTime: number;
}

export interface MissingIntervals {
  readonly timeframe: Timeframe;
  /** Missing open times, ascending. Empty when there is no gap. */
  readonly openTimes: readonly number[];
  /** First and last missing open time, or `undefined` when there is no gap. */
  readonly startTime: number | undefined;
  readonly endTime: number | undefined;
  /** True when the gap is longer than one pass and more remains after `endTime`. */
  readonly truncated: boolean;
}

function assertAligned(value: number, duration: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value % duration !== 0) {
    throw new Error(
      `MISSING_INTERVAL_ALIGNMENT: ${field} ${value} is not an aligned candle open time`
    );
  }
}

/**
 * Open time of the newest interval that has already closed at `now`.
 *
 * The interval containing `now` is still forming, so this steps one interval
 * back from it. This is the single place the forming-interval rule is applied.
 */
export function lastClosedOpenTime(now: number, timeframe: Timeframe): number {
  const duration = timeframeDurationMs(timeframe);
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error(`MISSING_INTERVAL_NOW: now must be a non-negative safe integer, got ${now}`);
  }
  const formingOpenTime = Math.floor(now / duration) * duration;
  return formingOpenTime - duration;
}

/**
 * The closed intervals between what was committed and what is already closed.
 *
 * The lower boundary is exclusive: `lastCommittedOpenTime` is already stored.
 * The upper boundary is inclusive: `throughOpenTime` is closed and, by the time
 * this is called, was not delivered live.
 */
export function missingClosedIntervals(request: MissingIntervalsRequest): MissingIntervals {
  const duration = timeframeDurationMs(request.timeframe);
  const empty: MissingIntervals = {
    timeframe: request.timeframe,
    openTimes: [],
    startTime: undefined,
    endTime: undefined,
    truncated: false
  };

  if (request.lastCommittedOpenTime === undefined) return empty;
  assertAligned(request.lastCommittedOpenTime, duration, "lastCommittedOpenTime");
  // A negative bound means no interval has closed yet at all, which is not an
  // error, just an empty gap.
  if (request.throughOpenTime < 0) return empty;
  assertAligned(request.throughOpenTime, duration, "throughOpenTime");

  const first = request.lastCommittedOpenTime + duration;
  if (request.throughOpenTime < first) return empty;

  const total = (request.throughOpenTime - first) / duration + 1;
  const count = Math.min(total, MAX_RECOVERY_INTERVALS);
  const openTimes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    openTimes.push(first + index * duration);
  }

  return {
    timeframe: request.timeframe,
    openTimes,
    startTime: first,
    endTime: first + (count - 1) * duration,
    truncated: total > count
  };
}
