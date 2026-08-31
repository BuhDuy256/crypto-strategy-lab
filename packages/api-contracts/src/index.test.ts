import { describe, expect, it } from "vitest";
import {
  isBacktestResultResponse,
  isBacktestTradesResponse,
  isCreateSearchExperimentResponse,
  isHealthResponse,
  isMarketLiveNotification,
  isMarketRealtimeMessage,
  isNewsHealthResponse,
  isNewsItemListResponse,
  isNewsSentimentDistributionResponse,
  type HealthResponse
} from "./index.js";

describe("market realtime contracts", () => {
  it("accepts a subscription with a versioned market key", () => {
    expect(isMarketRealtimeMessage({
      schemaVersion: "v1", type: "market:subscribe", subscriptionId: "chart-1",
      symbol: "BTCUSDT", timeframe: "5m"
    })).toBe(true);
  });

  it("accepts a durable snapshot with its revision watermark", () => {
    expect(isMarketRealtimeMessage({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
      symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 12, candles: []
    })).toBe(true);
  });

  it("accepts an ephemeral forming-candle tick addressed to a subscription", () => {
    expect(isMarketRealtimeMessage({
      schemaVersion: "v1", type: "candle.tick", subscriptionId: "chart-1",
      symbol: "BTCUSDT", timeframe: "5m",
      revisionWatermark: 13, sequence: 7,
      candle: {
        provider: "binance", symbol: "BTCUSDT", timeframe: "5m",
        openTime: 1, closeTime: 2, open: 1, high: 2, low: 1, close: 2,
        volume: 3, closed: false, revision: 1
      }
    })).toBe(true);
  });

  it("keeps the two live channels apart by their closed flag", () => {
    const forming = {
      provider: "binance", symbol: "BTCUSDT", timeframe: "5m",
      openTime: 1, closeTime: 2, open: 1, high: 2, low: 1, close: 2,
      volume: 3, closed: false, revision: 1
    };
    const base = {
      schemaVersion: "v1", symbol: "BTCUSDT", timeframe: "5m",
      revisionWatermark: 13, sequence: 7
    };
    expect(isMarketLiveNotification({ ...base, type: "candle.tick", candle: forming }))
      .toBe(true);
    expect(isMarketLiveNotification({ ...base, type: "candle.closed", candle: forming }))
      .toBe(false);
    expect(isMarketLiveNotification({
      ...base, type: "candle.closed", candle: { ...forming, closed: true }
    })).toBe(true);
  });

  it("rejects a live notification that carries a subscription identifier as a delivery", () => {
    const notification = {
      schemaVersion: "v1", type: "candle.tick", symbol: "BTCUSDT", timeframe: "5m",
      revisionWatermark: 13, sequence: 7,
      candle: {
        provider: "binance", symbol: "BTCUSDT", timeframe: "5m",
        openTime: 1, closeTime: 2, open: 1, high: 2, low: 1, close: 2,
        volume: 3, closed: false, revision: 1
      }
    };
    // Ingest publishes this shape; only the gateway may address it to a client.
    expect(isMarketLiveNotification(notification)).toBe(true);
    expect(isMarketRealtimeMessage(notification)).toBe(false);
  });

  it("accepts a refresh request for one subscription", () => {
    expect(isMarketRealtimeMessage({
      schemaVersion: "v1", type: "market:refresh-required", subscriptionId: "chart-1",
      reason: "slow-client"
    })).toBe(true);
  });

  it("rejects malformed subscription keys and unsafe watermarks", () => {
    expect(isMarketRealtimeMessage({
      schemaVersion: "v1", type: "market:subscribe", subscriptionId: "",
      symbol: "BTCUSDT", timeframe: "5m"
    })).toBe(false);
    expect(isMarketRealtimeMessage({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
      symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: -1, candles: []
    })).toBe(false);
  });
});

describe("CreateSearchExperimentResponse", () => {
  it("accepts a response that carries a string specId", () => {
    expect(isCreateSearchExperimentResponse({ specId: "spec-1" })).toBe(true);
  });

  it("rejects null, non-objects, and a missing or non-string specId", () => {
    expect(isCreateSearchExperimentResponse(null)).toBe(false);
    expect(isCreateSearchExperimentResponse("spec-1")).toBe(false);
    expect(isCreateSearchExperimentResponse({})).toBe(false);
    expect(isCreateSearchExperimentResponse({ specId: 1 })).toBe(false);
  });
});

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

describe("News query contracts (NEWS-07)", () => {
  it("accepts a well-formed paginated item list", () => {
    expect(isNewsItemListResponse({
      items: [{
        id: "coindesk-rss|https://example.com/a",
        title: "Fixture headline",
        source: "coindesk-rss",
        publishedAt: 1_788_177_600_000,
        relatedCoins: ["BTC"],
        analysisState: "analyzed"
      }],
      page: { pageNumber: 1, pageSize: 10, totalCount: 1 }
    })).toBe(true);
  });

  it("rejects a malformed item or missing paging metadata", () => {
    expect(isNewsItemListResponse({ items: [{ title: "no other fields" }], page: { pageNumber: 1, pageSize: 10, totalCount: 1 } })).toBe(false);
    expect(isNewsItemListResponse({ items: [], page: {} })).toBe(false);
    expect(isNewsItemListResponse(null)).toBe(false);
  });

  it("accepts a well-formed sentiment distribution", () => {
    expect(isNewsSentimentDistributionResponse({
      window: { startAt: 1_000, endAt: 2_000 },
      itemCount: 4,
      positive: 0.75,
      neutral: 0.25,
      negative: 0
    })).toBe(true);
  });

  it("rejects a distribution with a non-finite proportion or an inverted window", () => {
    expect(isNewsSentimentDistributionResponse({
      window: { startAt: 1_000, endAt: 2_000 }, itemCount: 1, positive: Number.NaN, neutral: 0, negative: 0
    })).toBe(false);
    expect(isNewsSentimentDistributionResponse({ itemCount: 0, positive: 0, neutral: 0, negative: 0 })).toBe(false);
  });

  it("accepts a well-formed health snapshot, including an unavailable analysis state", () => {
    expect(isNewsHealthResponse({
      collection: [{ provider: "coindesk-rss", status: "healthy", checkedAt: 1_788_177_600_000 }],
      analysis: {
        status: "unavailable",
        reason: "analysis has not completed any item yet",
        pendingCount: 0,
        degradedCount: 0,
        checkedAt: 0
      }
    })).toBe(true);
  });

  it("rejects an unknown status or a non-array collection list", () => {
    expect(isNewsHealthResponse({
      collection: [{ provider: "coindesk-rss", status: "offline", checkedAt: 0 }],
      analysis: { status: "healthy", pendingCount: 0, degradedCount: 0, checkedAt: 0 }
    })).toBe(false);
    expect(isNewsHealthResponse({
      collection: {},
      analysis: { status: "healthy", pendingCount: 0, degradedCount: 0, checkedAt: 0 }
    })).toBe(false);
  });
});
