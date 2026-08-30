// PostgreSQL-backed provider health. Internal to Market Data; callers outside
// the module receive only `ProviderHealthQuery`.

import type { Pool } from "pg";
import type {
  ProviderHealthQuery,
  ProviderHealthRecord,
  ProviderHealthStore
} from "../application/provider-health.js";
import type { ProviderHealth, ProviderHealthStatus } from "../application/market-data-provider.js";

interface ProviderHealthRow {
  readonly provider: string;
  readonly status: ProviderHealthStatus;
  readonly reason: string | null;
  readonly changed_at: string;
  readonly checked_at: string;
}

export class PostgresProviderHealthRepository implements ProviderHealthStore, ProviderHealthQuery {
  constructor(private readonly pool: Pool) {}

  /**
   * Upsert that keeps `changed_at` when only the timestamp moved.
   *
   * The moment an outage started is the part an operator reads, so a repeated
   * report of the same status must not reset it. The reason is part of the
   * comparison because "degraded, reconnecting" and "degraded, recovering
   * candles" are different states of the same status.
   */
  async record(state: ProviderHealthRecord): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO market.provider_health (provider, status, reason, changed_at, checked_at)
        VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT (provider) DO UPDATE SET
          status = EXCLUDED.status,
          reason = EXCLUDED.reason,
          changed_at = CASE
            WHEN market.provider_health.status IS DISTINCT FROM EXCLUDED.status
              OR market.provider_health.reason IS DISTINCT FROM EXCLUDED.reason
            THEN EXCLUDED.changed_at
            ELSE market.provider_health.changed_at
          END,
          checked_at = EXCLUDED.checked_at
      `,
      [state.provider, state.status, state.reason ?? null, state.checkedAt]
    );
  }

  async getHealth(provider: string): Promise<ProviderHealth | undefined> {
    const result = await this.pool.query<ProviderHealthRow>(
      `
        SELECT provider, status, reason, changed_at, checked_at
        FROM market.provider_health
        WHERE provider = $1
      `,
      [provider]
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      provider: row.provider,
      status: row.status,
      checkedAt: Number(row.checked_at),
      ...(row.reason === null ? {} : { reason: row.reason })
    };
  }

  /** When the current status was entered. Evidence that an outage was observed. */
  async getChangedAt(provider: string): Promise<number | undefined> {
    const result = await this.pool.query<{ changed_at: string }>(
      "SELECT changed_at FROM market.provider_health WHERE provider = $1",
      [provider]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : Number(row.changed_at);
  }
}
