// Behaviour tests for the News-owned, model-free sentiment feature query.

import { describe, expect, it } from "vitest";
import type { NewsItem } from "../domain/news-item.js";
import type { SentimentResult } from "../domain/sentiment-result.js";
import {
  createSentimentWindowIdentity,
  SentimentFeatureService,
  type SentimentFeatureStore,
  type SentimentFeatureStoredResult
} from "./sentiment-feature.js";

const AS_OF = Date.UTC(2026, 7, 31, 12, 0, 0);
const WINDOW_DURATION_MS = 60 * 60 * 1_000;

function record(input: {
  readonly id: string;
  readonly assetCodes: readonly string[];
  readonly publishedAt: number;
  readonly label: SentimentResult["label"];
  readonly score: number;
  readonly modelVersion: string;
}): SentimentFeatureStoredResult {
  const item: NewsItem = {
    id: input.id,
    title: "Fixture title",
    content: "Fixture content",
    source: "fixture-news",
    publishedAt: input.publishedAt,
    collectedAt: input.publishedAt,
    relatedCoins: input.assetCodes,
    url: `https://example.com/${input.id}`,
    analysisState: "analyzed"
  };
  const result: SentimentResult = {
    schemaVersion: 1,
    newsItemId: input.id,
    label: input.label,
    score: input.score,
    model: {
      modelId: "fixture-model",
      modelArtifactId: "fixture-artifact",
      modelVersion: input.modelVersion,
      inputVersion: "news-item.v1",
      preprocessingVersion: "plain-text.v1"
    },
    analyzedAt: input.publishedAt,
    status: "succeeded"
  };
  return { item, result };
}

function feature(records: readonly SentimentFeatureStoredResult[]): SentimentFeatureService {
  const store: SentimentFeatureStore = {
    findInWindow: async () => records
  };
  return new SentimentFeatureService(store);
}

describe("SentimentFeatureService", () => {
  it("returns the signed mean for only the requested asset inside the inclusive window", async () => {
    const snapshot = await feature([
      record({
        id: "btc-start",
        assetCodes: ["BTC"],
        publishedAt: AS_OF - WINDOW_DURATION_MS,
        label: "positive",
        score: 0.8,
        modelVersion: "model-v1"
      }),
      record({
        id: "btc-neutral",
        assetCodes: ["BTC"],
        publishedAt: AS_OF - 30 * 60 * 1_000,
        label: "neutral",
        score: 0.9,
        modelVersion: "model-v2"
      }),
      record({
        id: "btc-end",
        assetCodes: ["BTC"],
        publishedAt: AS_OF,
        label: "negative",
        score: 0.2,
        modelVersion: "model-v1"
      }),
      record({
        id: "eth-inside",
        assetCodes: ["ETH"],
        publishedAt: AS_OF - 20 * 60 * 1_000,
        label: "positive",
        score: 1,
        modelVersion: "model-v3"
      }),
      record({
        id: "btc-future",
        assetCodes: ["BTC"],
        publishedAt: AS_OF + 1,
        label: "positive",
        score: 1,
        modelVersion: "model-v4"
      })
    ]).resolve({
      assetCode: "btc",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "block" }
      }
    });

    expect(snapshot.feature).toMatchObject({
      assetCode: "BTC",
      window: {
        startAt: AS_OF - WINDOW_DURATION_MS,
        endAt: AS_OF,
        aggregationVersion: "signed-mean-v1"
      },
      itemCount: 3,
      valueOrigin: "observed",
      freshness: { state: "current", ageMs: 0 },
      quality: "current",
      usable: true,
      appliedPolicy: { state: "not-applied" }
    });
    expect(snapshot.feature.aggregateSentiment).toBeCloseTo(0.2);
    expect(snapshot.feature.window.id).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.provenance).toEqual({
      resultIds: ["btc-start", "btc-neutral", "btc-end"],
      modelVersions: ["model-v1", "model-v2"]
    });
  });

  it("blocks an empty window without inventing a sentiment value", async () => {
    const snapshot = await feature([]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "degrade" }
      }
    });

    expect(snapshot.feature).toMatchObject({
      assetCode: "BTC",
      itemCount: 0,
      aggregateSentiment: null,
      valueOrigin: "absent",
      freshness: { state: "missing", ageMs: null },
      quality: "blocked",
      usable: false,
      appliedPolicy: { state: "applied", reason: "missing", action: "block" }
    });
    expect(snapshot.provenance).toEqual({ resultIds: [], modelVersions: [] });
  });

  it("degrades an empty window without manufacturing a neutral value", async () => {
    const snapshot = await feature([]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "degrade" },
        onStale: { action: "block" }
      }
    });

    expect(snapshot.feature).toMatchObject({
      itemCount: 0,
      aggregateSentiment: null,
      valueOrigin: "absent",
      freshness: { state: "missing", ageMs: null },
      quality: "degraded",
      usable: false,
      appliedPolicy: { state: "applied", reason: "missing", action: "degrade" }
    });
  });

  it("uses only the configured substitute for an empty window", async () => {
    const snapshot = await feature([]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "substitute", substituteValue: -0.25 },
        onStale: { action: "block" }
      }
    });

    expect(snapshot.feature).toMatchObject({
      itemCount: 0,
      aggregateSentiment: -0.25,
      valueOrigin: "substitute",
      freshness: { state: "missing", ageMs: null },
      quality: "substituted",
      usable: true,
      appliedPolicy: { state: "applied", reason: "missing", action: "substitute" }
    });
  });

  it("blocks stale observed sentiment instead of returning it as current", async () => {
    const snapshot = await feature([
      record({
        id: "btc-stale",
        assetCodes: ["BTC"],
        publishedAt: AS_OF - 30 * 60 * 1_000 - 1,
        label: "positive",
        score: 0.6,
        modelVersion: "model-v1"
      })
    ]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "block" }
      }
    });

    expect(snapshot.feature).toMatchObject({
      itemCount: 1,
      aggregateSentiment: null,
      valueOrigin: "absent",
      freshness: { state: "stale", ageMs: 30 * 60 * 1_000 + 1 },
      quality: "blocked",
      usable: false,
      appliedPolicy: { state: "applied", reason: "stale", action: "block" }
    });
    expect(snapshot.provenance).toEqual({ resultIds: ["btc-stale"], modelVersions: ["model-v1"] });
  });

  it("degrades stale observed sentiment while retaining the real aggregate", async () => {
    const snapshot = await feature([
      record({
        id: "btc-stale",
        assetCodes: ["BTC"],
        publishedAt: AS_OF - 30 * 60 * 1_000 - 1,
        label: "positive",
        score: 0.6,
        modelVersion: "model-v1"
      })
    ]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "degrade" }
      }
    });

    expect(snapshot.feature).toMatchObject({
      itemCount: 1,
      aggregateSentiment: 0.6,
      valueOrigin: "observed",
      freshness: { state: "stale", ageMs: 30 * 60 * 1_000 + 1 },
      quality: "degraded",
      usable: true,
      appliedPolicy: { state: "applied", reason: "stale", action: "degrade" }
    });
  });

  it("substitutes stale observed sentiment without presenting the fallback as current", async () => {
    const snapshot = await feature([
      record({
        id: "btc-stale",
        assetCodes: ["BTC"],
        publishedAt: AS_OF - 30 * 60 * 1_000 - 1,
        label: "positive",
        score: 0.6,
        modelVersion: "model-v1"
      })
    ]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "substitute", substituteValue: 0.1 }
      }
    });

    expect(snapshot.feature).toMatchObject({
      itemCount: 1,
      aggregateSentiment: 0.1,
      valueOrigin: "substitute",
      freshness: { state: "stale", ageMs: 30 * 60 * 1_000 + 1 },
      quality: "substituted",
      usable: true,
      appliedPolicy: { state: "applied", reason: "stale", action: "substitute" }
    });
  });

  it("rejects a substitute below the signed range", async () => {
    await expect(feature([]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "substitute", substituteValue: -1.01 },
        onStale: { action: "block" }
      }
    })).rejects.toThrow("SENTIMENT_FEATURE_SUBSTITUTE: substituteValue must be within [-1, 1]");
  });

  it("rejects a substitute above the signed range", async () => {
    await expect(feature([]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "substitute", substituteValue: 1.01 }
      }
    })).rejects.toThrow("SENTIMENT_FEATURE_SUBSTITUTE: substituteValue must be within [-1, 1]");
  });

  it("rejects a substitute action without its required value", async () => {
    await expect(feature([]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "substitute" } as never,
        onStale: { action: "block" }
      }
    })).rejects.toThrow("SENTIMENT_FEATURE_SUBSTITUTE: substituteValue must be within [-1, 1]");
  });

  it("rejects a non-positive maximum freshness age", async () => {
    await expect(feature([]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 0,
        onMissing: { action: "block" },
        onStale: { action: "block" }
      }
    })).rejects.toThrow("SENTIMENT_FEATURE_DURATION: maxAgeMs must be a positive integer milliseconds value");
  });

  it("treats freshness exactly at maxAge as current", async () => {
    const snapshot = await feature([
      record({
        id: "btc-exact-age",
        assetCodes: ["BTC"],
        publishedAt: AS_OF - 30 * 60 * 1_000,
        label: "negative",
        score: 0.4,
        modelVersion: "model-v1"
      })
    ]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "block" }
      }
    });

    expect(snapshot.feature).toMatchObject({
      aggregateSentiment: -0.4,
      freshness: { state: "current", ageMs: 30 * 60 * 1_000 },
      quality: "current",
      appliedPolicy: { state: "not-applied" }
    });
  });

  it("makes window identity depend on canonical semantics and contributing result identities", () => {
    const base = {
      assetCode: "BTC",
      startAt: AS_OF - WINDOW_DURATION_MS,
      endAt: AS_OF,
      aggregationVersion: "signed-mean-v1",
      resultIds: ["result-a", "result-b"]
    };
    const identity = createSentimentWindowIdentity(base);

    expect(createSentimentWindowIdentity(base)).toBe(identity);
    expect(createSentimentWindowIdentity({ ...base, assetCode: "ETH" })).not.toBe(identity);
    expect(createSentimentWindowIdentity({ ...base, startAt: base.startAt + 1 })).not.toBe(identity);
    expect(createSentimentWindowIdentity({ ...base, endAt: base.endAt - 1 })).not.toBe(identity);
    expect(createSentimentWindowIdentity({ ...base, aggregationVersion: "signed-mean-v2" })).not.toBe(identity);
    expect(createSentimentWindowIdentity({ ...base, resultIds: ["result-a"] })).not.toBe(identity);
  });

  it("keeps model and adapter details out of the public feature response", async () => {
    const snapshot = await feature([
      record({
        id: "btc-public-boundary",
        assetCodes: ["BTC"],
        publishedAt: AS_OF,
        label: "positive",
        score: 0.7,
        modelVersion: "model-v1"
      })
    ]).resolve({
      assetCode: "BTC",
      asOf: AS_OF,
      windowDurationMs: WINDOW_DURATION_MS,
      policy: {
        maxAgeMs: 30 * 60 * 1_000,
        onMissing: { action: "block" },
        onStale: { action: "block" }
      }
    });

    const publicJson = JSON.stringify(snapshot.feature).toLowerCase();
    for (const forbidden of ["model", "artifact", "provider", "analyzer", "openai", "prompt", "preprocess", "resultid"]) {
      expect(publicJson).not.toContain(forbidden);
    }
    expect(snapshot.provenance).toEqual({
      resultIds: ["btc-public-boundary"],
      modelVersions: ["model-v1"]
    });
  });
});
