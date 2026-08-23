// Human-facing CLI that loads Binance history through the provider port into durable storage.

import { runMigrations } from "../../../migrate/migration-runner.js";
import { loadConfig } from "../../../platform/config.js";
import { createDatabasePool } from "../../../platform/database.js";
import { loadRootEnvFile } from "../../../platform/root-env.js";
import { SUPPORTED_TIMEFRAMES, type Timeframe } from "../domain/candle.js";
import { MarketBackfillService } from "../application/market-backfill-service.js";
import { BinanceMarketDataProvider } from "./binance-market-data-provider.js";
import { PostgresCandleRepository } from "./postgres-candle-repository.js";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing required --${name} argument`);
  }
  return value;
}

function timestampArgument(name: string): number {
  const value = Number(argument(name));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative Unix timestamp in milliseconds`);
  }
  return value;
}

async function run(): Promise<void> {
  loadRootEnvFile();
  const symbol = argument("symbol");
  const timeframeValue = argument("timeframe");
  if (!(SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframeValue)) {
    throw new Error(`--timeframe must be one of ${SUPPORTED_TIMEFRAMES.join(", ")}`);
  }
  const timeframe = timeframeValue as Timeframe;
  const startTime = timestampArgument("startTime");
  const endTime = timestampArgument("endTime");
  if (startTime > endTime) {
    throw new Error("--startTime must be less than or equal to --endTime");
  }

  const pool = createDatabasePool(loadConfig().postgres);
  try {
    await runMigrations(pool);
    const backfill = new MarketBackfillService(
      new BinanceMarketDataProvider(),
      new PostgresCandleRepository(pool)
    );
    const count = await backfill.backfill({ symbol, timeframe, startTime, endTime });
    console.log(`Stored ${count} closed candles for ${symbol} ${timeframe}.`);
  } finally {
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
