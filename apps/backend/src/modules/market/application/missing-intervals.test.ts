// Gap arithmetic. Pure input, pure output: no provider, no database, no clock.

import { describe, expect, it } from "vitest";
import {
  MAX_RECOVERY_INTERVALS,
  lastClosedOpenTime,
  missingClosedIntervals
} from "./missing-intervals.js";
import { timeframeDurationMs } from "../domain/candle.js";

const MINUTE = timeframeDurationMs("1m");
const BASE = 1_700_000_000_000 - (1_700_000_000_000 % timeframeDurationMs("1d"));

describe("lastClosedOpenTime", () => {
  it("never returns the interval that is still forming", () => {
    // Halfway through the interval opened at BASE: the newest closed one is the
    // interval before it.
    expect(lastClosedOpenTime(BASE + MINUTE / 2, "1m")).toBe(BASE - MINUTE);
    // Exactly on a boundary: the interval opening now has not closed either.
    expect(lastClosedOpenTime(BASE, "1m")).toBe(BASE - MINUTE);
    // One millisecond before the boundary the interval is still in its last
    // millisecond, so it has not closed yet either.
    expect(lastClosedOpenTime(BASE - 1, "1m")).toBe(BASE - 2 * MINUTE);
    expect(lastClosedOpenTime(BASE + MINUTE, "1m")).toBe(BASE);
  });

  it("applies the same rule to every timeframe", () => {
    const hour = timeframeDurationMs("1h");
    expect(lastClosedOpenTime(BASE + hour + 1, "1h")).toBe(BASE);
    const day = timeframeDurationMs("1d");
    expect(lastClosedOpenTime(BASE + day + 1, "1d")).toBe(BASE);
  });
});

describe("missingClosedIntervals", () => {
  it("reports no gap when the last committed candle is already the newest closed one", () => {
    const gap = missingClosedIntervals({
      timeframe: "1m",
      lastCommittedOpenTime: BASE,
      throughOpenTime: BASE
    });

    expect(gap.openTimes).toStrictEqual([]);
    expect(gap.startTime).toBeUndefined();
    expect(gap.endTime).toBeUndefined();
    expect(gap.truncated).toBe(false);
  });

  it("reports the single candle an outage of one interval lost", () => {
    const gap = missingClosedIntervals({
      timeframe: "1m",
      lastCommittedOpenTime: BASE,
      throughOpenTime: BASE + MINUTE
    });

    expect(gap.openTimes).toStrictEqual([BASE + MINUTE]);
    expect(gap.startTime).toBe(BASE + MINUTE);
    expect(gap.endTime).toBe(BASE + MINUTE);
  });

  it("includes the candle at each boundary of a multi-candle outage", () => {
    const gap = missingClosedIntervals({
      timeframe: "1m",
      lastCommittedOpenTime: BASE,
      throughOpenTime: BASE + 4 * MINUTE
    });

    // The first missing candle is the one right after the last committed one,
    // and the last missing candle is the newest closed one. Both boundaries are
    // in, and the already committed candle is out.
    expect(gap.openTimes).toStrictEqual([
      BASE + MINUTE,
      BASE + 2 * MINUTE,
      BASE + 3 * MINUTE,
      BASE + 4 * MINUTE
    ]);
    expect(gap.startTime).toBe(BASE + MINUTE);
    expect(gap.endTime).toBe(BASE + 4 * MINUTE);
    expect(gap.openTimes).not.toContain(BASE);
  });

  it("never counts the forming interval as a missing closed candle", () => {
    // The outage ends in the middle of the interval opened at BASE + 3m.
    const now = BASE + 3 * MINUTE + MINUTE / 3;
    const gap = missingClosedIntervals({
      timeframe: "1m",
      lastCommittedOpenTime: BASE,
      throughOpenTime: lastClosedOpenTime(now, "1m")
    });

    expect(gap.openTimes).toStrictEqual([BASE + MINUTE, BASE + 2 * MINUTE]);
    expect(gap.openTimes).not.toContain(BASE + 3 * MINUTE);
  });

  it("reports no gap when nothing was ever committed for the stream", () => {
    // Repairing a range that was never subscribed is outside this slice, so an
    // unknown lower boundary is an empty gap, not an unbounded backfill.
    const gap = missingClosedIntervals({
      timeframe: "1m",
      lastCommittedOpenTime: undefined,
      throughOpenTime: BASE + 10_000 * MINUTE
    });

    expect(gap.openTimes).toStrictEqual([]);
  });

  it("reports no gap when the newest closed interval is older than what is stored", () => {
    // A replayed or out-of-order resume must not produce a negative range.
    const gap = missingClosedIntervals({
      timeframe: "1m",
      lastCommittedOpenTime: BASE + 5 * MINUTE,
      throughOpenTime: BASE
    });

    expect(gap.openTimes).toStrictEqual([]);
  });

  it("bounds one pass and says more remains, instead of recovering without limit", () => {
    const gap = missingClosedIntervals({
      timeframe: "1m",
      lastCommittedOpenTime: BASE,
      throughOpenTime: BASE + (MAX_RECOVERY_INTERVALS + 500) * MINUTE
    });

    expect(gap.openTimes).toHaveLength(MAX_RECOVERY_INTERVALS);
    expect(gap.startTime).toBe(BASE + MINUTE);
    expect(gap.endTime).toBe(BASE + MAX_RECOVERY_INTERVALS * MINUTE);
    expect(gap.truncated).toBe(true);
  });

  it("uses the requested timeframe's own interval length", () => {
    const hour = timeframeDurationMs("1h");
    const gap = missingClosedIntervals({
      timeframe: "1h",
      lastCommittedOpenTime: BASE,
      throughOpenTime: BASE + 2 * hour
    });

    expect(gap.openTimes).toStrictEqual([BASE + hour, BASE + 2 * hour]);
  });

  it("rejects a boundary that is not an aligned candle open time", () => {
    expect(() =>
      missingClosedIntervals({
        timeframe: "1m",
        lastCommittedOpenTime: BASE + 1,
        throughOpenTime: BASE + MINUTE
      })
    ).toThrow(/MISSING_INTERVAL_ALIGNMENT/);
    expect(() =>
      missingClosedIntervals({
        timeframe: "1m",
        lastCommittedOpenTime: BASE,
        throughOpenTime: BASE + MINUTE + 1
      })
    ).toThrow(/MISSING_INTERVAL_ALIGNMENT/);
  });
});
