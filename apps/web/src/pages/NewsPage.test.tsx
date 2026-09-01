// @vitest-environment jsdom
// Verifies endpoint-only News loading, degraded rendering, and item paging.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NewsHealthResponse,
  NewsItemListResponse,
  NewsSentimentDistributionResponse
} from "@crypto-strategy-lab/api-contracts";
import {
  getNewsHealth,
  getNewsItems,
  getNewsSentimentDistribution
} from "../api/client.js";
import { NewsPage } from "./NewsPage.js";

vi.mock("../api/client.js", () => ({
  getNewsItems: vi.fn(),
  getNewsSentimentDistribution: vi.fn(),
  getNewsHealth: vi.fn()
}));

const NOW = Date.UTC(2026, 7, 31, 12);

function itemsResponse(overrides: Partial<NewsItemListResponse> = {}): NewsItemListResponse {
  return {
    items: [
      {
        id: "news-1",
        title: "Bitcoin reaches a new high",
        source: "CoinDesk",
        publishedAt: Date.UTC(2026, 7, 31, 10, 30),
        relatedCoins: ["BTC", "ETH"],
        analysisState: "analyzed"
      }
    ],
    page: { pageNumber: 1, pageSize: 10, totalCount: 1 },
    ...overrides
  };
}

function sentimentResponse(
  overrides: Partial<NewsSentimentDistributionResponse> = {}
): NewsSentimentDistributionResponse {
  return {
    window: { startAt: NOW - 86_400_000, endAt: NOW },
    itemCount: 8,
    positive: 0.5,
    neutral: 0.3,
    negative: 0.2,
    ...overrides
  };
}

function healthResponse(overrides: Partial<NewsHealthResponse> = {}): NewsHealthResponse {
  return {
    collection: [{ status: "healthy", checkedAt: NOW }],
    analysis: { status: "healthy", pendingCount: 0, degradedCount: 0, checkedAt: NOW },
    ...overrides
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.mocked(getNewsItems).mockResolvedValue(itemsResponse());
  vi.mocked(getNewsSentimentDistribution).mockResolvedValue(sentimentResponse());
  vi.mocked(getNewsHealth).mockResolvedValue(healthResponse());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("NewsPage", () => {
  it("lists collected items and displays the 24-hour sentiment and healthy News status", async () => {
    render(<NewsPage />);

    expect(await screen.findByRole("heading", { name: "News" })).not.toBeNull();
    expect(screen.getByText("Bitcoin reaches a new high")).not.toBeNull();
    expect(screen.getByText("CoinDesk")).not.toBeNull();
    expect(screen.getByText("2026-08-31T10:30:00.000Z")).not.toBeNull();
    expect(screen.getByText("BTC, ETH")).not.toBeNull();
    expect(screen.getByText("Analyzed")).not.toBeNull();

    expect(screen.getByText("Last 24 hours")).not.toBeNull();
    expect(screen.getByText("8 analyzed items")).not.toBeNull();
    expect(screen.getByText("Positive: 50%")).not.toBeNull();
    expect(screen.getByText("Neutral: 30%")).not.toBeNull();
    expect(screen.getByText("Negative: 20%")).not.toBeNull();
    expect(screen.getByText("Collection: healthy")).not.toBeNull();
    expect(screen.getByText("Analysis: healthy")).not.toBeNull();
    expect(screen.queryByText("coindesk-rss")).toBeNull();

    await waitFor(() => expect(getNewsItems).toHaveBeenCalledWith(1, 10));
    expect(getNewsSentimentDistribution).toHaveBeenCalledWith(NOW - 86_400_000, NOW);
    expect(getNewsHealth).toHaveBeenCalledTimes(1);
  });

  it("shows collection degradation without hiding collected items", async () => {
    vi.mocked(getNewsHealth).mockResolvedValue(healthResponse({
      collection: [{ status: "degraded", checkedAt: NOW, message: "source-degraded" }]
    }));

    render(<NewsPage />);

    expect(await screen.findByText("Collection: degraded")).not.toBeNull();
    expect(screen.getByText("Bitcoin reaches a new high")).not.toBeNull();
    expect(screen.queryByText("Feed unavailable")).toBeNull();
  });

  it("shows analysis degradation while collected items still list", async () => {
    vi.mocked(getNewsHealth).mockResolvedValue(healthResponse({
      analysis: {
        status: "degraded",
        message: "retry-limit-reached",
        pendingCount: 0,
        degradedCount: 1,
        checkedAt: NOW
      }
    }));

    render(<NewsPage />);

    expect(await screen.findByText("Analysis: degraded")).not.toBeNull();
    expect(screen.getByText("Bitcoin reaches a new high")).not.toBeNull();
    expect(screen.queryByText("1 item reached the retry limit")).toBeNull();
  });

  it("loads the next collected-item page without reloading health or sentiment", async () => {
    vi.mocked(getNewsItems).mockImplementation((pageNumber) => Promise.resolve(
      pageNumber === 2
        ? itemsResponse({
          items: [{
            id: "news-2",
            title: "Ethereum completes an upgrade",
            source: "The Block",
            publishedAt: Date.UTC(2026, 7, 31, 11),
            relatedCoins: ["ETH"],
            analysisState: "pending"
          }],
          page: { pageNumber: 2, pageSize: 10, totalCount: 11 }
        })
        : itemsResponse({ page: { pageNumber: 1, pageSize: 10, totalCount: 11 } })
    ));

    render(<NewsPage />);

    await screen.findByText("Bitcoin reaches a new high");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(getNewsItems).toHaveBeenLastCalledWith(2, 10));
    expect(await screen.findByText("Ethereum completes an upgrade")).not.toBeNull();
    expect(getNewsHealth).toHaveBeenCalledTimes(1);
    expect(getNewsSentimentDistribution).toHaveBeenCalledTimes(1);
  });
});
