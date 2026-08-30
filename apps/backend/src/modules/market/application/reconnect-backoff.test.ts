// The reconnect schedule. Pure, so it is asserted rather than waited for.

import { describe, expect, it } from "vitest";
import {
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_CEILING_MS,
  reconnectDelayMs
} from "./reconnect-backoff.js";

describe("reconnectDelayMs", () => {
  it("increases geometrically from the base delay", () => {
    const schedule = [1, 2, 3, 4, 5].map((attempt) => reconnectDelayMs(attempt));
    expect(schedule).toStrictEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
    expect(schedule[0]).toBe(RECONNECT_BASE_DELAY_MS);
  });

  it("never exceeds the documented ceiling, however long the outage lasts", () => {
    for (const attempt of [6, 10, 50, 1_000, Number.MAX_SAFE_INTEGER]) {
      expect(reconnectDelayMs(attempt)).toBe(RECONNECT_CEILING_MS);
    }
  });

  it("never returns a delay small enough to be a tight retry loop", () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect(reconnectDelayMs(attempt)).toBeGreaterThanOrEqual(RECONNECT_BASE_DELAY_MS);
    }
  });

  it("rejects an attempt number that is not a positive integer", () => {
    expect(() => reconnectDelayMs(0)).toThrow(/RECONNECT_ATTEMPT/);
    expect(() => reconnectDelayMs(-1)).toThrow(/RECONNECT_ATTEMPT/);
    expect(() => reconnectDelayMs(1.5)).toThrow(/RECONNECT_ATTEMPT/);
  });
});
