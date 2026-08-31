// News-owned sentiment feature query. It hides analyzer provenance from its feature response.

import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type { NewsItem } from "../domain/news-item.js";
import { normalizeSentimentResult, type SentimentResult } from "../domain/sentiment-result.js";

export const SIGNED_MEAN_V1 = "signed-mean-v1";

export type SentimentFeaturePolicyAction =
  | { readonly action: "block" }
  | { readonly action: "degrade" }
  | { readonly action: "substitute"; readonly substituteValue: number };

export interface SentimentFeaturePolicy {
  readonly maxAgeMs: number;
  readonly onMissing: SentimentFeaturePolicyAction;
  readonly onStale: SentimentFeaturePolicyAction;
}

export interface SentimentFeatureRequest {
  readonly assetCode: string;
  /** Unix epoch milliseconds in UTC. */
  readonly asOf: number;
  readonly windowDurationMs: number;
  readonly policy: SentimentFeaturePolicy;
}

export interface SentimentFeatureWindow {
  readonly id: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly aggregationVersion: typeof SIGNED_MEAN_V1;
}

export interface SentimentWindowIdentityInput {
  readonly assetCode: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly aggregationVersion: string;
  readonly resultIds: readonly string[];
}

export interface SentimentFeatureResponse {
  readonly assetCode: string;
  readonly window: SentimentFeatureWindow;
  readonly itemCount: number;
  readonly aggregateSentiment: number | null;
  readonly valueOrigin: "observed" | "substitute" | "absent";
  readonly freshness:
    | { readonly state: "current"; readonly ageMs: number }
    | { readonly state: "stale"; readonly ageMs: number }
    | { readonly state: "missing"; readonly ageMs: null };
  readonly quality: "current" | "degraded" | "substituted" | "blocked";
  readonly usable: boolean;
  readonly appliedPolicy:
    | { readonly state: "not-applied" }
    | { readonly state: "applied"; readonly reason: "missing" | "stale"; readonly action: string };
}

/** Durable internals for Experiment provenance, never part of `SentimentFeatureResponse`. */
export interface SentimentFeatureProvenance {
  readonly resultIds: readonly string[];
  readonly modelVersions: readonly string[];
}

export interface SentimentFeatureSnapshot {
  readonly feature: SentimentFeatureResponse;
  readonly provenance: SentimentFeatureProvenance;
}

export interface SentimentFeatureStoredResult {
  readonly item: NewsItem;
  readonly result: SentimentResult;
}

export interface SentimentFeatureStore {
  findInWindow(request: {
    readonly assetCode: string;
    readonly startAt: number;
    readonly endAt: number;
  }): Promise<readonly SentimentFeatureStoredResult[]>;
}

/** The only News query seam Experiment needs when a descriptor requests sentiment. */
export interface SentimentFeature {
  resolve(request: SentimentFeatureRequest): Promise<SentimentFeatureSnapshot>;
}

const ASSET_CODE_PATTERN = /^[A-Z0-9]{2,12}$/;

function normalizeAssetCode(value: string): string {
  const assetCode = value.trim().toUpperCase();
  if (!ASSET_CODE_PATTERN.test(assetCode)) {
    throw new Error("SENTIMENT_FEATURE_ASSET_CODE: assetCode must be a canonical asset code");
  }
  return assetCode;
}

function assertPositiveDuration(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`SENTIMENT_FEATURE_DURATION: ${field} must be a positive integer milliseconds value`);
  }
}

function assertPolicyAction(action: SentimentFeaturePolicyAction): void {
  if (action.action !== "block" && action.action !== "degrade" && action.action !== "substitute") {
    throw new Error("SENTIMENT_FEATURE_POLICY: action must be block, degrade, or substitute");
  }
  if (action.action === "substitute" &&
    (!Number.isFinite(action.substituteValue) || action.substituteValue < -1 || action.substituteValue > 1)) {
    throw new Error("SENTIMENT_FEATURE_SUBSTITUTE: substituteValue must be within [-1, 1]");
  }
}

export function assertSentimentFeaturePolicy(policy: SentimentFeaturePolicy): void {
  assertPositiveDuration(policy.maxAgeMs, "maxAgeMs");
  assertPolicyAction(policy.onMissing);
  assertPolicyAction(policy.onStale);
}

function normalizeValue(result: SentimentResult): number {
  if (result.label === "positive") return result.score;
  if (result.label === "neutral") return 0;
  return -result.score;
}

function belongsInWindow(
  record: SentimentFeatureStoredResult,
  assetCode: string,
  startAt: number,
  endAt: number
): boolean {
  return record.item.analysisState === "analyzed" &&
    record.result.status === "succeeded" &&
    record.result.newsItemId === record.item.id &&
    record.item.relatedCoins.includes(assetCode) &&
    record.item.publishedAt >= startAt &&
    record.item.publishedAt <= endAt;
}

export function createSentimentWindowIdentity(input: SentimentWindowIdentityInput): string {
  return canonicalSha256({
    assetCode: input.assetCode,
    startAt: input.startAt,
    endAt: input.endAt,
    aggregationVersion: input.aggregationVersion,
    resultIds: [...new Set(input.resultIds)].sort()
  });
}

function createWindow(assetCode: string, startAt: number, endAt: number, resultIds: readonly string[]): SentimentFeatureWindow {
  return {
    id: createSentimentWindowIdentity({
      assetCode,
      startAt,
      endAt,
      aggregationVersion: SIGNED_MEAN_V1,
      resultIds
    }),
    startAt,
    endAt,
    aggregationVersion: SIGNED_MEAN_V1
  };
}

/**
 * Calculates a deterministic signed mean for one canonical asset. The public
 * feature contains only feature semantics; its separately carried provenance is
 * for Experiment's durable result boundary.
 */
export class SentimentFeatureService implements SentimentFeature {
  constructor(private readonly store: SentimentFeatureStore) {}

  async resolve(request: SentimentFeatureRequest): Promise<SentimentFeatureSnapshot> {
    const assetCode = normalizeAssetCode(request.assetCode);
    if (!Number.isSafeInteger(request.asOf) || request.asOf < 0) {
      throw new Error("SENTIMENT_FEATURE_AS_OF: asOf must be a non-negative UTC timestamp");
    }
    assertPositiveDuration(request.windowDurationMs, "windowDurationMs");
    assertSentimentFeaturePolicy(request.policy);
    const startAt = request.asOf - request.windowDurationMs;
    const candidates = await this.store.findInWindow({ assetCode, startAt, endAt: request.asOf });
    const included = candidates.filter((record) =>
      belongsInWindow(record, assetCode, startAt, request.asOf)
    ).sort((left, right) => left.item.publishedAt - right.item.publishedAt ||
      left.result.newsItemId.localeCompare(right.result.newsItemId));

    for (const record of included) {
      const normalized = normalizeSentimentResult(record.result);
      if (normalized.kind === "rejected") {
        throw new Error(`SENTIMENT_FEATURE_RESULT_INVALID: ${normalized.reason}`);
      }
    }

    const resultIds = included.map((record) => record.result.newsItemId);
    const provenance: SentimentFeatureProvenance = {
      resultIds,
      modelVersions: [...new Set(included.map((record) => record.result.model.modelVersion))].sort()
    };
    const window = createWindow(assetCode, startAt, request.asOf, resultIds);
    if (included.length === 0) {
      if (request.policy.onMissing.action === "block") {
        return {
          feature: {
            assetCode,
            window,
            itemCount: 0,
            aggregateSentiment: null,
            valueOrigin: "absent",
            freshness: { state: "missing", ageMs: null },
            quality: "blocked",
            usable: false,
            appliedPolicy: { state: "applied", reason: "missing", action: "block" }
          },
          provenance
        };
      }
      if (request.policy.onMissing.action === "degrade") {
        return {
          feature: {
            assetCode,
            window,
            itemCount: 0,
            aggregateSentiment: null,
            valueOrigin: "absent",
            freshness: { state: "missing", ageMs: null },
            quality: "degraded",
            usable: false,
            appliedPolicy: { state: "applied", reason: "missing", action: "degrade" }
          },
          provenance
        };
      }
      return {
        feature: {
          assetCode,
          window,
          itemCount: 0,
          aggregateSentiment: request.policy.onMissing.substituteValue,
          valueOrigin: "substitute",
          freshness: { state: "missing", ageMs: null },
          quality: "substituted",
          usable: true,
          appliedPolicy: { state: "applied", reason: "missing", action: "substitute" }
        },
        provenance
      };
    }

    const aggregateSentiment = included.reduce((sum, record) => sum + normalizeValue(record.result), 0) /
      included.length;
    const latestPublishedAt = included[included.length - 1]?.item.publishedAt;
    if (latestPublishedAt === undefined) {
      throw new Error("SENTIMENT_FEATURE_MISSING_POLICY_NOT_IMPLEMENTED");
    }
    const ageMs = request.asOf - latestPublishedAt;
    if (ageMs > request.policy.maxAgeMs) {
      if (request.policy.onStale.action === "block") {
        return {
          feature: {
            assetCode,
            window,
            itemCount: included.length,
            aggregateSentiment: null,
            valueOrigin: "absent",
            freshness: { state: "stale", ageMs },
            quality: "blocked",
            usable: false,
            appliedPolicy: { state: "applied", reason: "stale", action: "block" }
          },
          provenance
        };
      }
      if (request.policy.onStale.action === "degrade") {
        return {
          feature: {
            assetCode,
            window,
            itemCount: included.length,
            aggregateSentiment,
            valueOrigin: "observed",
            freshness: { state: "stale", ageMs },
            quality: "degraded",
            usable: true,
            appliedPolicy: { state: "applied", reason: "stale", action: "degrade" }
          },
          provenance
        };
      }
      return {
        feature: {
          assetCode,
          window,
          itemCount: included.length,
          aggregateSentiment: request.policy.onStale.substituteValue,
          valueOrigin: "substitute",
          freshness: { state: "stale", ageMs },
          quality: "substituted",
          usable: true,
          appliedPolicy: { state: "applied", reason: "stale", action: "substitute" }
        },
        provenance
      };
    }
    return {
      feature: {
        assetCode,
        window,
        itemCount: included.length,
        aggregateSentiment,
        valueOrigin: "observed",
        freshness: { state: "current", ageMs },
        quality: "current",
        usable: true,
        appliedPolicy: { state: "not-applied" }
      },
      provenance
    };
  }
}
