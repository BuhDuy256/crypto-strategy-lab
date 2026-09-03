// Builds the Experiment-owned durable usage manifest from News feature snapshots.

import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type { SentimentFeatureSnapshot, SentimentFeatureWindow } from "../../news/index.js";

export const SENTIMENT_USAGE_MANIFEST_SCHEMA_VERSION = "sentiment-feature-usage.v1";

export interface SentimentFeatureUsage {
  readonly window: SentimentFeatureWindow;
  readonly resultIds: readonly string[];
  readonly modelVersions: readonly string[];
  /** Frozen feature freshness makes the applied policy interpretable after the run. */
  readonly freshness: SentimentFeatureSnapshot["feature"]["freshness"];
  readonly quality: SentimentFeatureSnapshot["feature"]["quality"];
  readonly appliedPolicy: SentimentFeatureSnapshot["feature"]["appliedPolicy"];
}

export interface SentimentUsageManifest {
  readonly schemaVersion: typeof SENTIMENT_USAGE_MANIFEST_SCHEMA_VERSION;
  readonly snapshots: readonly SentimentFeatureUsage[];
}

function usageFrom(snapshot: SentimentFeatureSnapshot): SentimentFeatureUsage {
  return {
    window: snapshot.feature.window,
    resultIds: [...new Set(snapshot.provenance.resultIds)].sort(),
    modelVersions: [...new Set(snapshot.provenance.modelVersions)].sort(),
    freshness: snapshot.feature.freshness,
    quality: snapshot.feature.quality,
    appliedPolicy: snapshot.feature.appliedPolicy
  };
}

/** Keeps the actual rolling snapshots, deduplicated by their deterministic identity. */
export function createSentimentUsageManifest(
  snapshots: readonly SentimentFeatureSnapshot[]
): SentimentUsageManifest {
  const byWindowId = new Map<string, SentimentFeatureUsage>();
  for (const snapshot of snapshots) {
    const usage = usageFrom(snapshot);
    const existing = byWindowId.get(usage.window.id);
    if (existing !== undefined && canonicalSha256(existing) !== canonicalSha256(usage)) {
      throw new Error(`EXPERIMENT_SENTIMENT_USAGE_CONFLICT: ${usage.window.id}`);
    }
    byWindowId.set(usage.window.id, usage);
  }
  return {
    schemaVersion: SENTIMENT_USAGE_MANIFEST_SCHEMA_VERSION,
    snapshots: [...byWindowId.values()].sort((left, right) =>
      left.window.endAt - right.window.endAt || left.window.startAt - right.window.startAt ||
      left.window.id.localeCompare(right.window.id))
  };
}
