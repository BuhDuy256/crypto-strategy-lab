// CoinDesk's configured RSS adapter. It reads only feed fields, never article pages.

import { deduplicateNewsItems, normalizeNewsItem, type NewsItem } from "../domain/news-item.js";
import {
  NewsProviderError,
  type NewsProvider,
  type NewsProviderHealth
} from "../application/news-provider.js";

const PROVIDER_ID = "coindesk-rss";

export interface RssHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export interface RssHttpRequest {
  readonly signal: AbortSignal;
  readonly headers: Readonly<Record<string, string>>;
}

export type RssFetch = (url: string, request: RssHttpRequest) => Promise<RssHttpResponse>;

export interface CoinDeskRssNewsProviderOptions {
  readonly feedUrl: string;
  readonly requestTimeoutMs: number;
  readonly retryCount: number;
  readonly retryDelayMs: number;
  readonly fetch?: RssFetch;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function decodeXmlText(value: string): string {
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1");
  return withoutCdata
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexadecimal: string) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16))
    )
    .replace(/&#([0-9]+);/gu, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function requiredRssField(itemXml: string, name: string): string {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "iu").exec(itemXml);
  const value = match?.[1] === undefined ? undefined : decodeXmlText(match[1]).trim();
  if (value === undefined || value === "") {
    throw new Error(`COINDESK_RSS_${name.toUpperCase()}: required RSS field is absent`);
  }
  return value;
}

function parsePublishedAt(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("COINDESK_RSS_PUBDATE: published timestamp is invalid");
  }
  return timestamp;
}

function parseRssItems(xml: string, collectedAt: number): readonly NewsItem[] {
  if (!/<rss\b[^>]*>/iu.test(xml) || !/<\/rss\s*>/iu.test(xml)) {
    throw new Error("COINDESK_RSS_DOCUMENT: expected a complete RSS document");
  }
  const entries = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)];
  if (entries.length === 0) {
    throw new Error("COINDESK_RSS_ITEMS: feed contains no RSS items");
  }

  const items: NewsItem[] = [];
  for (const entry of entries) {
    const itemXml = entry[1];
    if (itemXml === undefined) throw new Error("COINDESK_RSS_ITEM: item content is absent");
    const normalized = normalizeNewsItem({
      title: requiredRssField(itemXml, "title"),
      content: requiredRssField(itemXml, "description"),
      source: PROVIDER_ID,
      publishedAt: parsePublishedAt(requiredRssField(itemXml, "pubDate")),
      collectedAt,
      relatedCoins: [],
      url: requiredRssField(itemXml, "link")
    });
    if (normalized.kind === "rejected") {
      throw new Error(`COINDESK_RSS_NORMALIZATION: ${normalized.reason}`);
    }
    items.push(normalized.item);
  }
  return deduplicateNewsItems(items);
}

/** RSS-only provider with a bounded, configuration-driven request policy. */
export class CoinDeskRssNewsProvider implements NewsProvider {
  private readonly fetch: RssFetch;
  private readonly now: () => number;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private health: NewsProviderHealth;

  constructor(private readonly options: CoinDeskRssNewsProviderOptions) {
    this.fetch = options.fetch ?? ((url, request) => fetch(url, request));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleep;
    this.health = {
      provider: PROVIDER_ID,
      status: "unavailable",
      checkedAt: this.now(),
      reason: "No RSS request has completed."
    };
  }

  async fetchLatest(): Promise<readonly NewsItem[]> {
    try {
      const xml = await this.fetchFeed();
      const items = parseRssItems(xml, this.now());
      this.health = { provider: PROVIDER_ID, status: "healthy", checkedAt: this.now() };
      return items;
    } catch (error: unknown) {
      if (error instanceof NewsProviderError) {
        this.health = {
          provider: PROVIDER_ID,
          status: "unavailable",
          checkedAt: this.now(),
          reason: error.message
        };
        throw error;
      }
      const reason = error instanceof Error ? error.message : "unknown RSS validation failure";
      const providerError = new NewsProviderError(
        "INVALID_PROVIDER_DATA",
        PROVIDER_ID,
        `CoinDesk RSS response is invalid: ${reason}`
      );
      this.health = {
        provider: PROVIDER_ID,
        status: "degraded",
        checkedAt: this.now(),
        reason: providerError.message
      };
      throw providerError;
    }
  }

  async getHealth(): Promise<NewsProviderHealth> {
    return this.health;
  }

  private async fetchFeed(): Promise<string> {
    let failure = "unknown transport failure";
    for (let attempt = 0; attempt <= this.options.retryCount; attempt += 1) {
      try {
        const response = await this.fetch(this.options.feedUrl, {
          signal: AbortSignal.timeout(this.options.requestTimeoutMs),
          headers: {
            Accept: "application/rss+xml, application/xml;q=0.9",
            "User-Agent": "CryptoStrategyLab/1.0 RSS collection"
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
      } catch (error: unknown) {
        failure = error instanceof Error ? error.message : "unknown transport failure";
        if (attempt < this.options.retryCount) {
          await this.sleep(this.options.retryDelayMs);
        }
      }
    }
    throw new NewsProviderError(
      "PROVIDER_UNAVAILABLE",
      PROVIDER_ID,
      `CoinDesk RSS request failed after ${this.options.retryCount + 1} attempt(s): ${failure}`
    );
  }
}
