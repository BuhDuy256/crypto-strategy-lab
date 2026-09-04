// Deterministic adapter test for the News-owned sentiment feature read port.

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresSentimentFeatureStore } from "./postgres-sentiment-feature-store.js";

describe("PostgresSentimentFeatureStore", () => {
  it("maps only analyzed successful rows selected for the requested canonical asset window", async () => {
    const query = vi.fn(async () => ({
      rows: [{
        id: "fixture-news|https://example.com/btc",
        title: "Bitcoin fixture",
        content: "Fixture content",
        source: "fixture-news",
        published_at: "1788177600000",
        collected_at: "1788177600000",
        related_coins: ["BTC"],
        url: "https://example.com/btc",
        analysis_state: "analyzed",
        schema_version: 1,
        news_item_id: "fixture-news|https://example.com/btc",
        label: "positive",
        score: 0.7,
        model_id: "fixture-model",
        model_artifact_id: "fixture-artifact",
        model_version: "fixture-v1",
        input_version: "news-item.v1",
        preprocessing_version: "plain-text.v1",
        analyzed_at: "1788177600000",
        status: "succeeded"
      }]
    }));
    const store = new PostgresSentimentFeatureStore({ query } as unknown as Pool);

    const results = await store.findInWindow({
      assetCode: "BTC",
      startAt: 1_788_174_000_000,
      endAt: 1_788_177_600_000
    });

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as unknown as [string, readonly unknown[]];
    expect(params).toEqual(["BTC", 1_788_174_000_000, 1_788_177_600_000]);
    expect(sql).toContain("i.related_coins ? $1");
    expect(sql).toContain("i.published_at >= $2 AND i.published_at <= $3");
    expect(results).toEqual([{
      item: {
        id: "fixture-news|https://example.com/btc",
        title: "Bitcoin fixture",
        content: "Fixture content",
        source: "fixture-news",
        publishedAt: 1_788_177_600_000,
        collectedAt: 1_788_177_600_000,
        relatedCoins: ["BTC"],
        url: "https://example.com/btc",
        analysisState: "analyzed"
      },
      result: {
        schemaVersion: 1,
        newsItemId: "fixture-news|https://example.com/btc",
        label: "positive",
        score: 0.7,
        model: {
          modelId: "fixture-model",
          modelArtifactId: "fixture-artifact",
          modelVersion: "fixture-v1",
          inputVersion: "news-item.v1",
          preprocessingVersion: "plain-text.v1"
        },
        analyzedAt: 1_788_177_600_000,
        status: "succeeded"
      }
    }]);
  });
});
