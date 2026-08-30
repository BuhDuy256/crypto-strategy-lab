// PostgreSQL adapter that maps a durable run to the frozen specification it
// executed. It reads only the run's spec_id and writes nothing.

import type { Pool } from "pg";
import type { BacktestRunSpecLocator } from "../application/search-annotation-recompute.js";

export class PostgresRunSpecLocator implements BacktestRunSpecLocator {
  constructor(private readonly pool: Pool) {}

  async specIdForRun(runId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ spec_id: string }>(
      "SELECT spec_id FROM experiment.backtest_runs WHERE run_id = $1",
      [runId]
    );
    return result.rows[0]?.spec_id;
  }
}
