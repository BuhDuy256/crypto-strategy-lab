// Provider-neutral NewsItem normalization and identity rules.
// Providers normalize untrusted content here so later News stages use one stable contract.

export const MAX_NEWS_CONTENT_LENGTH = 20_000;

/**
 * Lifecycle of one collected item. Collection only ever writes `pending`; the
 * analyzer stage owns the remaining states (see migration 0017).
 */
export type NewsAnalysisState = "pending" | "analyzing" | "analyzed" | "degraded";

export interface NewsItem {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly source: string;
  /** Unix epoch milliseconds in UTC. */
  readonly publishedAt: number;
  /** Unix epoch milliseconds in UTC. */
  readonly collectedAt: number;
  readonly relatedCoins: readonly string[];
  readonly url: string;
  readonly analysisState: NewsAnalysisState;
}

export type NewsItemRejectionReason =
  | "ITEM_NOT_AN_OBJECT"
  | "TITLE_REQUIRED"
  | "CONTENT_REQUIRED"
  | "SOURCE_INVALID"
  | "PUBLISHED_AT_TIMEZONE_REQUIRED"
  | "PUBLISHED_AT_INVALID"
  | "COLLECTED_AT_INVALID"
  | "RELATED_COINS_INVALID"
  | "URL_INVALID";

export type NewsItemNormalizationResult =
  | { readonly kind: "accepted"; readonly item: NewsItem }
  | { readonly kind: "rejected"; readonly reason: NewsItemRejectionReason };

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9.-]{0,127}$/;
const COIN_PATTERN = /^[A-Z0-9]{2,12}$/;
const ISO_TIMESTAMP_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i;
const NULL_CHARACTER = String.fromCharCode(0);

type RecordValue = Readonly<Record<string, unknown>>;

function rejected(reason: NewsItemRejectionReason): NewsItemNormalizationResult {
  return { kind: "rejected", reason };
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTitle(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const title = value.split(NULL_CHARACTER).join("").replace(/\s+/gu, " ").trim();
  return title === "" ? undefined : title;
}

function normalizeContent(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const content = value.split(NULL_CHARACTER).join("").trim();
  if (content === "") {
    return undefined;
  }

  return content.slice(0, MAX_NEWS_CONTENT_LENGTH);
}

function normalizeSource(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const source = value.trim().toLowerCase();
  return SOURCE_PATTERN.test(source) ? source : undefined;
}

function normalizeUtcTimestamp(
  value: unknown,
  timezoneRequiredReason: NewsItemRejectionReason,
  invalidReason: NewsItemRejectionReason
): number | NewsItemRejectionReason {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : invalidReason;
  }
  if (typeof value !== "string") {
    return invalidReason;
  }
  if (!ISO_TIMESTAMP_WITH_TIMEZONE.test(value)) {
    return timezoneRequiredReason;
  }

  const timestamp = Date.parse(value);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : invalidReason;
}

function normalizeRelatedCoins(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const coins = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") {
      return undefined;
    }
    const coin = candidate.trim().toUpperCase();
    if (!COIN_PATTERN.test(coin)) {
      return undefined;
    }
    coins.add(coin);
  }

  return [...coins].sort();
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function isRejectionReason(value: number | NewsItemRejectionReason): value is NewsItemRejectionReason {
  return typeof value === "string";
}

/**
 * Normalizes one provider candidate without throwing for hostile input.
 * Times are accepted only as UTC epoch milliseconds or ISO 8601 strings with an explicit offset.
 * Identity is the normalized source plus canonical URL; repeated identities keep the first item.
 * Content is trimmed and truncated to MAX_NEWS_CONTENT_LENGTH UTF-16 code units.
 */
export function normalizeNewsItem(candidate: unknown): NewsItemNormalizationResult {
  if (!isRecord(candidate)) {
    return rejected("ITEM_NOT_AN_OBJECT");
  }

  const title = normalizeTitle(candidate.title);
  if (title === undefined) {
    return rejected("TITLE_REQUIRED");
  }
  const content = normalizeContent(candidate.content);
  if (content === undefined) {
    return rejected("CONTENT_REQUIRED");
  }
  const source = normalizeSource(candidate.source);
  if (source === undefined) {
    return rejected("SOURCE_INVALID");
  }
  const publishedAt = normalizeUtcTimestamp(
    candidate.publishedAt,
    "PUBLISHED_AT_TIMEZONE_REQUIRED",
    "PUBLISHED_AT_INVALID"
  );
  if (isRejectionReason(publishedAt)) {
    return rejected(publishedAt);
  }
  const collectedAt = normalizeUtcTimestamp(
    candidate.collectedAt,
    "COLLECTED_AT_INVALID",
    "COLLECTED_AT_INVALID"
  );
  if (isRejectionReason(collectedAt)) {
    return rejected(collectedAt);
  }
  const relatedCoins = normalizeRelatedCoins(candidate.relatedCoins);
  if (relatedCoins === undefined) {
    return rejected("RELATED_COINS_INVALID");
  }
  const url = normalizeUrl(candidate.url);
  if (url === undefined) {
    return rejected("URL_INVALID");
  }

  return {
    kind: "accepted",
    item: {
      id: `${source}|${url}`,
      title,
      content,
      source,
      publishedAt,
      collectedAt,
      relatedCoins,
      url,
      analysisState: "pending"
    }
  };
}

/** Keeps the first collected item for each deterministic NewsItem identity. */
export function deduplicateNewsItems(items: readonly NewsItem[]): readonly NewsItem[] {
  const seen = new Set<string>();
  const unique: NewsItem[] = [];

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }

  return unique;
}

function fail(rule: string, message: string): never {
  throw new Error(`${rule}: ${message}`);
}

function assertField(rule: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    fail(rule, `expected ${String(expected)}, got ${String(actual)}`);
  }
}

/** Asserts that a provider returned one fully normalized NewsItem at runtime. */
export function assertNormalizedNewsItem(candidate: unknown): asserts candidate is NewsItem {
  const normalized = normalizeNewsItem(candidate);
  if (normalized.kind === "rejected") {
    fail(`NEWS_ITEM_${normalized.reason}`, "provider returned malformed news content");
  }
  if (!isRecord(candidate)) {
    fail("NEWS_ITEM_NOT_AN_OBJECT", "provider returned a non-object item");
  }

  const expected = normalized.item;
  assertField("NEWS_ITEM_ID", candidate.id, expected.id);
  assertField("NEWS_ITEM_TITLE_NORMALIZED", candidate.title, expected.title);
  assertField("NEWS_ITEM_CONTENT_NORMALIZED", candidate.content, expected.content);
  assertField("NEWS_ITEM_SOURCE_NORMALIZED", candidate.source, expected.source);
  assertField("NEWS_ITEM_PUBLISHED_AT_NORMALIZED", candidate.publishedAt, expected.publishedAt);
  assertField("NEWS_ITEM_COLLECTED_AT_NORMALIZED", candidate.collectedAt, expected.collectedAt);
  assertField("NEWS_ITEM_URL_NORMALIZED", candidate.url, expected.url);
  assertField("NEWS_ITEM_ANALYSIS_STATE", candidate.analysisState, "pending");

  if (
    !Array.isArray(candidate.relatedCoins) ||
    candidate.relatedCoins.length !== expected.relatedCoins.length ||
    candidate.relatedCoins.some((coin, index) => coin !== expected.relatedCoins[index])
  ) {
    fail("NEWS_ITEM_RELATED_COINS_NORMALIZED", "provider returned non-normalized related coins");
  }
}

/** Validates normalized provider output and rejects duplicate deterministic identities. */
export function assertNewsItemCollection(
  candidates: readonly unknown[]
): asserts candidates is readonly NewsItem[] {
  const identities = new Set<string>();

  for (const candidate of candidates) {
    assertNormalizedNewsItem(candidate);
    if (identities.has(candidate.id)) {
      fail("NEWS_ITEM_DUPLICATE", `provider returned duplicate identity ${candidate.id}`);
    }
    identities.add(candidate.id);
  }
}
