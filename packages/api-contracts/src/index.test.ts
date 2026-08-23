import { describe, expect, it } from "vitest";
import {
  isBacktestResultResponse,
  isBacktestTradesResponse,
  isHealthResponse,
  type HealthResponse
} from "./index.js";

describe("HealthResponse", () => {
  it("accepts a well-formed health response", () => {
    const value: HealthResponse = { status: "ok" };
    expect(isHealthResponse(value)).toBe(true);
  });

  it("rejects null, non-objects, and objects with the wrong status", () => {
    expect(isHealthResponse(null)).toBe(false);
    expect(isHealthResponse(undefined)).toBe(false);
    expect(isHealthResponse("ok")).toBe(false);
    expect(isHealthResponse({ status: "down" })).toBe(false);
    expect(isHealthResponse({})).toBe(false);
  });
});

const execution = {
  initialCapital: 10_000, feeRate: 0.001, slippageRate: 0.0005,
  signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
  leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
  stopLoss: { enabled: false }, takeProfit: { enabled: false },
  sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close",
  decimalPlaces: 8
};

const completed = {
  runId: "run", status: "completed", resultId: "result", specId: "spec",
  specificationHash: "a".repeat(64), createdAt: "created", updatedAt: "updated",
  completedAt: "completed", metricSet: { id: "mvp-metrics", version: "1.0.0" },
  metrics: { totalReturn: 0.1, winRate: 0.5, maximumDrawdown: 0.02, numberOfTrades: 2 },
  executionAssumptions: execution, annotations: []
};

describe("EXP-10 runtime contracts", () => {
  it("accepts complete result and trade-page payloads", () => {
    expect(isBacktestResultResponse(completed)).toBe(true);
    expect(isBacktestTradesResponse({
      runId: "run", status: "completed",
      trades: [{
        sequenceNumber: 0, direction: "long", entryTime: 1, entryPrice: 100,
        exitTime: 2, exitPrice: 101, quantity: 1, entryFee: 0.1, exitFee: 0.1,
        slippage: 0.05, profitAndLoss: 0.8, exitReason: "signal"
      }],
      page: { pageNumber: 1, pageSize: 10, totalCount: 1 }
    })).toBe(true);
  });

  it("rejects missing, null, non-finite, and malformed nested result fields", () => {
    expect(isBacktestResultResponse({ ...completed, metrics: null })).toBe(false);
    expect(isBacktestResultResponse({
      ...completed, metrics: { ...completed.metrics, winRate: Number.NaN }
    })).toBe(false);
    expect(isBacktestResultResponse({ ...completed, executionAssumptions: {} })).toBe(false);
    expect(isBacktestResultResponse({
      ...completed,
      executionAssumptions: {
        ...completed.executionAssumptions,
        stopLoss: { enabled: false, percentage: "invalid" }
      }
    })).toBe(false);
    expect(isBacktestResultResponse({ ...completed, metricSet: { id: "mvp-metrics" } })).toBe(false);
  });

  it("rejects malformed trades and incomplete or unsafe paging metadata", () => {
    const base = { runId: "run", status: "completed", trades: [] };
    expect(isBacktestTradesResponse({ ...base, trades: [null], page: { pageNumber: 1, pageSize: 10, totalCount: 1 } })).toBe(false);
    expect(isBacktestTradesResponse({ ...base, page: {} })).toBe(false);
    expect(isBacktestTradesResponse({
      ...base, page: { pageNumber: Number.MAX_SAFE_INTEGER + 1, pageSize: 10, totalCount: 0 }
    })).toBe(false);
  });
});
