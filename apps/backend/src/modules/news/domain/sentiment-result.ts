// Versioned SentimentResult contract owned by News Intelligence.
//
// The result is what leaves the analyzer boundary, so every field that makes a
// result reproducible is required here rather than at an adapter's discretion.
// No model, library, or language may appear in this file.

/** Version of the NewsItem shape handed to an analyzer as inference input. */
export const NEWS_SENTIMENT_INPUT_VERSION = "news-item.v1";

/** Version of this result contract. Bumped when the stored result shape changes. */
export const SENTIMENT_RESULT_SCHEMA_VERSION = 1;

export const SENTIMENT_LABELS = ["positive", "neutral", "negative"] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

/** A result exists only for a completed inference; failures live in attempt history. */
export type SentimentResultStatus = "succeeded";

export interface SentimentModelProvenance {
  /** Stable name of the model or service, never an alias. */
  readonly modelId: string;
  /** Identity of the exact artefact that produced the result, never an alias. */
  readonly modelArtifactId: string;
  readonly modelVersion: string;
  readonly inputVersion: string;
  readonly preprocessingVersion: string;
}

export interface SentimentResult {
  readonly schemaVersion: number;
  readonly newsItemId: string;
  readonly label: SentimentLabel;
  /** Bounded to the closed interval from -1 (negative) to 1 (positive). */
  readonly score: number;
  readonly model: SentimentModelProvenance;
  /** Unix epoch milliseconds in UTC. */
  readonly analyzedAt: number;
  readonly status: SentimentResultStatus;
}

/**
 * Moving names that identify "whichever artefact is current" instead of one exact
 * artefact. Recording one of these loses the ability to reproduce a result, so the
 * boundary rejects them.
 */
export const MODEL_ALIASES_FORBIDDEN_IN_PROVENANCE = [
  "latest",
  "stable",
  "default",
  "current",
  "newest",
  "head",
  "main",
  "prod",
  "production",
  "dev",
  "edge",
  "nightly"
] as const;

export type SentimentResultRejectionReason =
  | "RESULT_NOT_AN_OBJECT"
  | "SCHEMA_VERSION_INVALID"
  | "NEWS_ITEM_ID_INVALID"
  | "LABEL_INVALID"
  | "SCORE_INVALID"
  | "PROVENANCE_INCOMPLETE"
  | "PROVENANCE_ALIAS_FORBIDDEN"
  | "ANALYZED_AT_INVALID"
  | "STATUS_INVALID";

export type SentimentResultNormalizationResult =
  | { readonly kind: "accepted"; readonly result: SentimentResult }
  | { readonly kind: "rejected"; readonly reason: SentimentResultRejectionReason };

const PROVENANCE_FIELDS = [
  "modelId",
  "modelArtifactId",
  "modelVersion",
  "inputVersion",
  "preprocessingVersion"
] as const;

const PROVENANCE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/;
const ALIASES = new Set<string>(MODEL_ALIASES_FORBIDDEN_IN_PROVENANCE);

type RecordValue = Readonly<Record<string, unknown>>;

function rejected(
  reason: SentimentResultRejectionReason
): SentimentResultNormalizationResult {
  return { kind: "rejected", reason };
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Splits a provenance value into alphanumeric segments, so `model:latest` is caught. */
function containsAlias(value: string): boolean {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .some((segment) => ALIASES.has(segment));
}

function normalizeProvenance(
  value: unknown
): SentimentModelProvenance | SentimentResultRejectionReason {
  if (!isRecord(value)) {
    return "PROVENANCE_INCOMPLETE";
  }

  const normalized: Record<string, string> = {};
  for (const field of PROVENANCE_FIELDS) {
    const raw = value[field];
    if (typeof raw !== "string" || !PROVENANCE_VALUE_PATTERN.test(raw.trim())) {
      return "PROVENANCE_INCOMPLETE";
    }
    const trimmed = raw.trim();
    if (containsAlias(trimmed)) {
      return "PROVENANCE_ALIAS_FORBIDDEN";
    }
    normalized[field] = trimmed;
  }

  return normalized as unknown as SentimentModelProvenance;
}

function isRejection(
  value: SentimentModelProvenance | SentimentResultRejectionReason
): value is SentimentResultRejectionReason {
  return typeof value === "string";
}

/**
 * Validates one candidate result without throwing. Every provenance field is
 * required and must name one exact artefact; aliases are rejected here so no
 * unreproducible result can reach durable state.
 */
export function normalizeSentimentResult(
  candidate: unknown
): SentimentResultNormalizationResult {
  if (!isRecord(candidate)) {
    return rejected("RESULT_NOT_AN_OBJECT");
  }
  if (candidate.schemaVersion !== SENTIMENT_RESULT_SCHEMA_VERSION) {
    return rejected("SCHEMA_VERSION_INVALID");
  }
  if (typeof candidate.newsItemId !== "string" || candidate.newsItemId.trim() === "") {
    return rejected("NEWS_ITEM_ID_INVALID");
  }
  if (!SENTIMENT_LABELS.includes(candidate.label as SentimentLabel)) {
    return rejected("LABEL_INVALID");
  }
  if (
    typeof candidate.score !== "number" ||
    !Number.isFinite(candidate.score) ||
    candidate.score < -1 ||
    candidate.score > 1
  ) {
    return rejected("SCORE_INVALID");
  }
  const model = normalizeProvenance(candidate.model);
  if (isRejection(model)) {
    return rejected(model);
  }
  if (
    typeof candidate.analyzedAt !== "number" ||
    !Number.isSafeInteger(candidate.analyzedAt) ||
    candidate.analyzedAt < 0
  ) {
    return rejected("ANALYZED_AT_INVALID");
  }
  if (candidate.status !== "succeeded") {
    return rejected("STATUS_INVALID");
  }

  return {
    kind: "accepted",
    result: {
      schemaVersion: SENTIMENT_RESULT_SCHEMA_VERSION,
      newsItemId: candidate.newsItemId,
      label: candidate.label as SentimentLabel,
      score: candidate.score,
      model,
      analyzedAt: candidate.analyzedAt,
      status: "succeeded"
    }
  };
}
