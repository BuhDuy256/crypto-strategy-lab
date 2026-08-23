import type { BacktestInput } from "../../apps/backend/src/modules/experiment/domain/backtester.js";

export const deterministicBacktestInput: BacktestInput = {
  candles: [
    { openTime: 0, closeTime: 9, open: 100, high: 102, low: 99, close: 101, volume: 1 },
    { openTime: 10, closeTime: 19, open: 101, high: 106, low: 100, close: 105, volume: 1 }
  ],
  signals: [{ action: "buy", effectiveTime: 9 }],
  annotations: [],
  execution: {
    initialCapital: 1000, feeRate: 0.001, slippageRate: 0.001,
    signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
    leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
    stopLoss: { enabled: false }, takeProfit: { enabled: false },
    sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close", decimalPlaces: 8
  }
};
