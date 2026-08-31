// Tests the News worker's own durable liveness record without a provider or analyzer.

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { NEWS_COLLECTION_WORKER_ID } from "../application/news-worker-heartbeat.js";
import { PostgresNewsWorkerHeartbeat } from "./postgres-news-worker-heartbeat.js";

describe("PostgresNewsWorkerHeartbeat", () => {
  it("records immediately and on the configured interval", async () => {
    const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
      void sql;
      void params;
    });
    let scheduled: (() => void) | undefined;
    let cleared: unknown;
    let now = 100;
    const heartbeat = new PostgresNewsWorkerHeartbeat(
      { query } as unknown as Pool,
      30_000,
      { warn: () => undefined },
      () => now,
      {
        setInterval: (callback) => {
          scheduled = callback;
          return "heartbeat-timer";
        },
        clearInterval: (handle) => { cleared = handle; }
      }
    );

    await heartbeat.start();
    now = 200;
    scheduled?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    heartbeat.stop();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toEqual([NEWS_COLLECTION_WORKER_ID, 100]);
    expect(query.mock.calls[1]?.[1]).toEqual([NEWS_COLLECTION_WORKER_ID, 200]);
    expect(String(query.mock.calls[0]?.[0])).toContain("news.collection_worker_heartbeat");
    expect(cleared).toBe("heartbeat-timer");
  });
});
