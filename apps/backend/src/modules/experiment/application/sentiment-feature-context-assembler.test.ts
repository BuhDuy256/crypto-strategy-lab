// Tests the Experiment seam that resolves News sentiment only when a descriptor asks for it.

import { describe, expect, it, vi } from "vitest";
import type { SentimentFeature, SentimentFeatureSnapshot } from "../../news/index.js";
import type { StrategyDescriptor } from "../../strategy/index.js";
import {
  ExperimentSentimentContextAssembler,
  mapUsdtMarketSymbolToNewsAsset,
  type SentimentFeatureResolver
} from "./sentiment-feature-context-assembler.js";

const technicalDescriptor: Pick<StrategyDescriptor, "requiredInputs"> = {
  requiredInputs: ["price-bars"]
};

const sentimentDescriptor: Pick<StrategyDescriptor, "requiredInputs"> = {
  requiredInputs: ["price-bars", "sentiment-series"]
};

function snapshot(input: {
  readonly id: string;
  readonly asOf: number;
  readonly score: number;
  readonly resultIds: readonly string[];
  readonly modelVersions: readonly string[];
}): SentimentFeatureSnapshot {
  return {
    feature: {
      assetCode: "BTC",
      window: {
        id: input.id,
        startAt: input.asOf - 60_000,
        endAt: input.asOf,
        aggregationVersion: "signed-mean-v1"
      },
      itemCount: input.resultIds.length,
      aggregateSentiment: input.score,
      valueOrigin: "observed",
      freshness: { state: "current", ageMs: 0 },
      quality: "current",
      usable: true,
      appliedPolicy: { state: "not-applied" }
    },
    provenance: { resultIds: input.resultIds, modelVersions: input.modelVersions }
  };
}

describe("ExperimentSentimentContextAssembler", () => {
  it("maps the explicit USDT market-pair boundary to the News canonical base asset", () => {
    expect(mapUsdtMarketSymbolToNewsAsset("btcusdt")).toBe("BTC");
    expect(() => mapUsdtMarketSymbolToNewsAsset("BTCUSD")).toThrow("EXPERIMENT_NEWS_ASSET_MAPPING");
  });

  it("does not resolve or call the sentiment feature for a technical-only descriptor", async () => {
    const resolver: SentimentFeatureResolver = {
      resolve: vi.fn(() => { throw new Error("technical-only must not resolve News"); })
    };

    const assembly = await new ExperimentSentimentContextAssembler(resolver).assemble({
      descriptor: technicalDescriptor,
      marketSymbol: "BTCUSDT",
      evaluationTimes: [1_788_177_600_000]
    });

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(assembly).toEqual({ status: "technical-only", entries: [], usageManifest: undefined });
  });

  it("assembles rolling sentiment inputs and a deduplicated multi-window usage manifest", async () => {
    const firstTime = 1_788_177_600_000;
    const secondTime = firstTime + 60_000;
    const snapshots = [
      snapshot({
        id: "window-first",
        asOf: firstTime,
        score: 0.3,
        resultIds: ["result-a"],
        modelVersions: ["model-v1"]
      }),
      snapshot({
        id: "window-second",
        asOf: secondTime,
        score: -0.2,
        resultIds: ["result-b", "result-c"],
        modelVersions: ["model-v1", "model-v2"]
      })
    ];
    const feature: SentimentFeature = {
      resolve: vi.fn(async () => {
        const next = snapshots.shift();
        if (next === undefined) throw new Error("unexpected feature call");
        return next;
      })
    };
    const resolver: SentimentFeatureResolver = { resolve: vi.fn(() => feature) };

    const assembly = await new ExperimentSentimentContextAssembler(resolver).assemble({
      descriptor: sentimentDescriptor,
      marketSymbol: "BTCUSDT",
      evaluationTimes: [firstTime, secondTime],
      sentimentInput: {
        windowDurationMs: 60_000,
        policy: {
          maxAgeMs: 30_000,
          onMissing: { action: "block" },
          onStale: { action: "degrade" }
        }
      }
    });

    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(feature.resolve).toHaveBeenCalledWith({
      assetCode: "BTC",
      asOf: firstTime,
      windowDurationMs: 60_000,
      policy: {
        maxAgeMs: 30_000,
        onMissing: { action: "block" },
        onStale: { action: "degrade" }
      }
    });
    expect(assembly).toMatchObject({
      status: "ready",
      entries: [
        { evaluationTime: firstTime, input: { kind: "sentiment-series", points: [{ time: firstTime, score: 0.3 }] } },
        {
          evaluationTime: secondTime,
          input: {
            kind: "sentiment-series",
            points: [{ time: firstTime, score: 0.3 }, { time: secondTime, score: -0.2 }]
          }
        }
      ],
      usageManifest: {
        schemaVersion: "sentiment-feature-usage.v1",
        snapshots: [
          {
            window: { id: "window-first", startAt: firstTime - 60_000, endAt: firstTime },
            resultIds: ["result-a"],
            modelVersions: ["model-v1"],
            quality: "current",
            appliedPolicy: { state: "not-applied" }
          },
          {
            window: { id: "window-second", startAt: secondTime - 60_000, endAt: secondTime },
            resultIds: ["result-b", "result-c"],
            modelVersions: ["model-v1", "model-v2"],
            quality: "current",
            appliedPolicy: { state: "not-applied" }
          }
        ]
      }
    });
  });
});
