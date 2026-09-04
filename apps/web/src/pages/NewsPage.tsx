// Route-local News reads keep worker or endpoint failure out of the shared shell.

import { useEffect, useState } from "react";
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
import { formatDateTime } from "../format.js";

const PAGE_SIZE = 10;
const SENTIMENT_WINDOW_MS = 24 * 60 * 60 * 1_000;

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pageCount(list: NewsItemListResponse): number {
  if (list.page.pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(list.page.totalCount / list.page.pageSize));
}

export function NewsPage() {
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [items, setItems] = useState<NewsItemListResponse | null>(null);
  const [sentiment, setSentiment] = useState<NewsSentimentDistributionResponse | null>(null);
  const [health, setHealth] = useState<NewsHealthResponse | null>(null);
  const [itemsUnavailable, setItemsUnavailable] = useState(false);
  const [sentimentUnavailable, setSentimentUnavailable] = useState(false);
  const [healthUnavailable, setHealthUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void getNewsItems(pageNumber, PAGE_SIZE)
      .then((response) => {
        if (!active) return;
        setItems(response);
        setItemsUnavailable(false);
      })
      .catch(() => {
        if (active) setItemsUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [pageNumber, refreshVersion]);

  useEffect(() => {
    let active = true;
    const endAt = Date.now();
    void getNewsSentimentDistribution(endAt - SENTIMENT_WINDOW_MS, endAt)
      .then((response) => {
        if (!active) return;
        setSentiment(response);
        setSentimentUnavailable(false);
      })
      .catch(() => {
        if (active) setSentimentUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [refreshVersion]);

  useEffect(() => {
    let active = true;
    void getNewsHealth()
      .then((response) => {
        if (!active) return;
        setHealth(response);
        setHealthUnavailable(false);
      })
      .catch(() => {
        if (active) setHealthUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [refreshVersion]);

  const refresh = (): void => {
    setItems(null);
    setSentiment(null);
    setHealth(null);
    setItemsUnavailable(false);
    setSentimentUnavailable(false);
    setHealthUnavailable(false);
    setRefreshVersion((current) => current + 1);
  };

  return (
    <section className="news-page">
      <div className="page-heading">
        <div>
          <h1>News</h1>
          <p>Collected news and sentiment health.</p>
        </div>
        <button type="button" className="news-refresh" onClick={refresh}>
          Refresh data
        </button>
      </div>

      <div className="news-summary-grid">
        <section className="news-card" aria-labelledby="sentiment-heading">
          <h2 id="sentiment-heading">Sentiment distribution</h2>
          <p>Last 24 hours</p>
          {sentimentUnavailable ? (
            <p role="status">Sentiment distribution unavailable.</p>
          ) : sentiment === null ? (
            <p>Loading sentiment distribution...</p>
          ) : (
            <>
              <p>{sentiment.itemCount} analyzed items</p>
              <div className="sentiment-bar" aria-label="Sentiment distribution">
                <span className="sentiment-positive" style={{ width: percentage(sentiment.positive) }} />
                <span className="sentiment-neutral" style={{ width: percentage(sentiment.neutral) }} />
                <span className="sentiment-negative" style={{ width: percentage(sentiment.negative) }} />
              </div>
              <ul className="sentiment-labels">
                <li>Positive: {percentage(sentiment.positive)}</li>
                <li>Neutral: {percentage(sentiment.neutral)}</li>
                <li>Negative: {percentage(sentiment.negative)}</li>
              </ul>
            </>
          )}
        </section>

        <section className="news-card" aria-labelledby="health-heading">
          <h2 id="health-heading">News health</h2>
          {healthUnavailable ? (
            <p role="status">News health unavailable.</p>
          ) : health === null ? (
            <p>Loading News health...</p>
          ) : (
            <div className="news-health-list">
              {health.collection.length === 0 ? (
                <p>Collection: unavailable</p>
              ) : (
                health.collection.map((source, index) => (
                  <p
                    key={`${source.status}:${source.checkedAt}:${index}`}
                    className={`news-health-status news-health-${source.status}`}
                  >
                    Collection: {source.status}
                  </p>
                ))
              )}
              <p className={`news-health-status news-health-${health.analysis.status}`}>
                Analysis: {health.analysis.status}
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="news-card news-items-card" aria-labelledby="items-heading">
        <h2 id="items-heading">Collected items</h2>
        {itemsUnavailable ? (
          <p role="status">Collected items unavailable.</p>
        ) : items === null ? (
          <p>Loading collected items...</p>
        ) : items.items.length === 0 ? (
          <p>No collected items in this page.</p>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Source</th>
                  <th>Published</th>
                  <th>Related coins</th>
                  <th>Analysis</th>
                </tr>
              </thead>
              <tbody>
                {items.items.map((item) => (
                  <tr key={item.id}>
                    <td className="news-title" title={item.title}>{item.title}</td>
                    <td>{item.source}</td>
                    <td className="news-published">{formatDateTime(item.publishedAt)}</td>
                    <td>{item.relatedCoins.join(", ") || "None"}</td>
                    <td>
                      <span className="status-chip" data-status={item.analysisState}>
                        {statusLabel(item.analysisState)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-footer">
              <button
                type="button"
                onClick={() => setPageNumber((current) => current - 1)}
                disabled={items.page.pageNumber === 1}
              >
                Previous page
              </button>
              <span>
                Page {items.page.pageNumber} of {pageCount(items)}
              </span>
              <button
                type="button"
                onClick={() => setPageNumber((current) => current + 1)}
                disabled={items.page.pageNumber * items.page.pageSize >= items.page.totalCount}
              >
                Next page
              </button>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
