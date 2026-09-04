// Experiment context seam that leaves technical-only descriptors independent from News.

import type { SentimentFeature, SentimentFeatureResponse } from "../../news/index.js";
import type { SentimentSeriesInput, StrategyDescriptor } from "../../strategy/index.js";
import type { SentimentInputConfiguration } from "../domain/sentiment-input.js";
import {
  createSentimentUsageManifest,
  type SentimentUsageManifest
} from "./sentiment-usage-manifest.js";

export interface SentimentFeatureResolver {
  resolve(): SentimentFeature;
}

export interface SentimentContextAssemblyRequest {
  readonly descriptor: Pick<StrategyDescriptor, "requiredInputs">;
  readonly marketSymbol: string;
  readonly evaluationTimes: readonly number[];
  readonly sentimentInput?: SentimentInputConfiguration;
}

export interface SentimentContextEntry {
  readonly evaluationTime: number;
  readonly input: SentimentSeriesInput;
}

export type SentimentContextAssembly =
  | {
    readonly status: "technical-only";
    readonly entries: readonly [];
    readonly usageManifest: undefined;
  }
  | {
    readonly status: "ready";
    readonly entries: readonly SentimentContextEntry[];
    readonly usageManifest: SentimentUsageManifest;
  }
  | {
    readonly status: "blocked";
    readonly entries: readonly SentimentContextEntry[];
    readonly usageManifest: SentimentUsageManifest;
    readonly decision: SentimentFeatureResponse;
  };

const USDT_MARKET_SYMBOL = /^([A-Z0-9]{2,12})USDT$/;

/** Maps only the currently supported explicit USDT market-pair form at the Experiment boundary. */
export function mapUsdtMarketSymbolToNewsAsset(marketSymbol: string): string {
  const normalized = marketSymbol.trim().toUpperCase();
  const match = USDT_MARKET_SYMBOL.exec(normalized);
  const assetCode = match?.[1];
  if (assetCode === undefined) {
    throw new Error("EXPERIMENT_NEWS_ASSET_MAPPING: marketSymbol must use the explicit <BASE>USDT form");
  }
  return assetCode;
}

export class ExperimentSentimentContextAssembler {
  constructor(private readonly sentimentFeatures: SentimentFeatureResolver) {}

  async assemble(request: SentimentContextAssemblyRequest): Promise<SentimentContextAssembly> {
    if (!request.descriptor.requiredInputs.includes("sentiment-series")) {
      return { status: "technical-only", entries: [], usageManifest: undefined };
    }
    if (request.sentimentInput === undefined) {
      throw new Error("EXPERIMENT_SENTIMENT_INPUT_REQUIRED");
    }
    const feature = this.sentimentFeatures.resolve();
    const assetCode = mapUsdtMarketSymbolToNewsAsset(request.marketSymbol);
    const entries: SentimentContextEntry[] = [];
    const snapshots = [];
    const points: { time: number; score: number }[] = [];
    for (const evaluationTime of request.evaluationTimes) {
      const snapshot = await feature.resolve({
        assetCode,
        asOf: evaluationTime,
        windowDurationMs: request.sentimentInput.windowDurationMs,
        policy: request.sentimentInput.policy
      });
      snapshots.push(snapshot);
      const manifest = createSentimentUsageManifest(snapshots);
      if (!snapshot.feature.usable || snapshot.feature.aggregateSentiment === null) {
        return { status: "blocked", entries, usageManifest: manifest, decision: snapshot.feature };
      }
      points.push({ time: evaluationTime, score: snapshot.feature.aggregateSentiment });
      entries.push({
        evaluationTime,
        input: { kind: "sentiment-series", points: [...points] }
      });
    }
    return { status: "ready", entries, usageManifest: createSentimentUsageManifest(snapshots) };
  }
}
