// Hand-checked fixtures for deterministic V1 execution behavior.

import { describe, expect, it } from "vitest";
import { Backtester } from "./backtester.js";
import type { ExecutionModelConfiguration } from "./experiment-specification.js";

const execution: ExecutionModelConfiguration = {
  initialCapital: 1000, feeRate: 0.001, slippageRate: 0.001,
  signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
  leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
  stopLoss: { enabled: false }, takeProfit: { enabled: false },
  sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close", decimalPlaces: 8
};
const bars = [
  { openTime: 0, closeTime: 9, open: 100, high: 101, low: 99, close: 100, volume: 1 },
  { openTime: 10, closeTime: 19, open: 100, high: 111, low: 99, close: 110, volume: 1 },
  { openTime: 20, closeTime: 29, open: 110, high: 112, low: 89, close: 90, volume: 1 }
];

describe("Backtester", () => {
  it("fills on the next open, reverses, charges fees/slippage, and closes the final position", () => {
    const result = new Backtester().run({
      candles: bars,
      signals: [{ action: "buy", effectiveTime: 9 }, { action: "sell", effectiveTime: 19 }],
      annotations: [], execution
    });
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ direction: "long", entryTime: 10, exitTime: 20, exitReason: "signal" });
    expect(result.trades[1]).toMatchObject({ direction: "short", entryTime: 20, exitTime: 29, exitReason: "final-liquidation" });
    expect(result.trades.every((trade) => trade.entryFee > 0 && trade.exitFee > 0 && trade.slippage > 0)).toBe(true);
  });

  it("does nothing for hold and never fills from the same candle", () => {
    const result = new Backtester().run({ candles: bars, signals: [{ action: "hold", effectiveTime: 9 }], annotations: [], execution });
    expect(result.trades).toEqual([]);
  });

  it("does not use a future signal to fill an earlier candle", () => {
    const result = new Backtester().run({ candles: bars.slice(0, 2), signals: [{ action: "buy", effectiveTime: 19 }], annotations: [], execution });
    expect(result.trades).toEqual([]);
  });

  it("uses stop loss before take profit when both levels occur in one candle", () => {
    const result = new Backtester().run({
      candles: [bars[0]!, { ...bars[1]!, high: 106, low: 94 }],
      signals: [{ action: "buy", effectiveTime: 9 }], annotations: [{ type: "level", id: "x", label: "x", value: 1 }],
      execution: { ...execution, stopLoss: { enabled: true, percentage: 0.05 }, takeProfit: { enabled: true, percentage: 0.05 } }
    });
    expect(result.trades[0]?.exitReason).toBe("stop-loss");
    expect(result.annotations).toHaveLength(1);
  });

  it("closes an old position at the open before considering that candle's range", () => {
    const result = new Backtester().run({
      candles: bars,
      signals: [{ action: "buy", effectiveTime: 9 }, { action: "sell", effectiveTime: 19 }],
      annotations: [],
      execution: { ...execution, stopLoss: { enabled: true, percentage: 0.05 } }
    });
    expect(result.trades[0]?.exitReason).toBe("signal");
  });

  it("produces an identical canonical result on repeated runs", () => {
    const input = { candles: bars, signals: [{ action: "buy" as const, effectiveTime: 9 }], annotations: [], execution };
    expect(new Backtester().run(input)).toEqual(new Backtester().run(input));
  });
});
