// PostgreSQL-backed liveness heartbeat for the normal News worker process.
// It writes independently of RSS collection so source health keeps provider meaning.

import type { Pool } from "pg";
import {
  NEWS_COLLECTION_WORKER_ID,
  type NewsWorkerHeartbeat
} from "../application/news-worker-heartbeat.js";

export interface NewsWorkerHeartbeatLogger {
  warn(message: string, context?: string): void;
}

export interface NewsWorkerHeartbeatTimer {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemTimer: NewsWorkerHeartbeatTimer = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
};

export class PostgresNewsWorkerHeartbeat implements NewsWorkerHeartbeat {
  private handle: unknown | undefined;

  constructor(
    private readonly pool: Pool,
    private readonly intervalMs: number,
    private readonly logger: NewsWorkerHeartbeatLogger,
    private readonly now: () => number = Date.now,
    private readonly timer: NewsWorkerHeartbeatTimer = systemTimer
  ) {}

  async start(): Promise<void> {
    if (this.handle !== undefined) return;
    await this.recordHeartbeat();
    this.handle = this.timer.setInterval(() => {
      void this.recordHeartbeat().catch(() => {
        this.logger.warn("News collection worker heartbeat could not be persisted.", "NewsWorker");
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.handle === undefined) return;
    this.timer.clearInterval(this.handle);
    this.handle = undefined;
  }

  private async recordHeartbeat(): Promise<void> {
    await this.pool.query(
      `INSERT INTO news.collection_worker_heartbeat (worker_id, checked_at)
       VALUES ($1, $2)
       ON CONFLICT (worker_id) DO UPDATE SET checked_at = EXCLUDED.checked_at`,
      [NEWS_COLLECTION_WORKER_ID, this.now()]
    );
  }
}
