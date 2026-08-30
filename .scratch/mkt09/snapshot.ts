// One-off evidence tool for MKT-09 M8: take a dataset snapshot before the
// outage and resolve it again afterwards. Not production code.
import { createDatabasePool } from "../../apps/backend/src/platform/database.js";
import { loadConfig } from "../../apps/backend/src/platform/config.js";
import { MarketDatasetService } from "../../apps/backend/src/modules/market/application/market-dataset-service.js";
import { PostgresCandleRepository } from "../../apps/backend/src/modules/market/infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "../../apps/backend/src/modules/market/infrastructure/postgres-dataset-manifest-store.js";
import { readFileSync, writeFileSync } from "node:fs";

const REF_FILE = new URL("./dataset-ref.json", import.meta.url);

async function main(): Promise<void> {
  const mode = process.argv[2];
  const pool = createDatabasePool(loadConfig().postgres);
  const repository = new PostgresCandleRepository(pool);
  const datasets = new MarketDatasetService(repository, new PostgresDatasetManifestStore(pool));
  try {
    if (mode === "create") {
      const startTime = Number(process.argv[3]);
      const endTime = Number(process.argv[4]);
      const manifest = await datasets.createDataset({
        provider: "binance", symbol: "BTCUSDT", timeframe: "1m", range: { startTime, endTime }
      });
      writeFileSync(REF_FILE, JSON.stringify(manifest.ref, null, 2));
      console.log(JSON.stringify({
        integrityHash: manifest.ref.integrityHash,
        revisionWatermark: manifest.ref.revisionWatermark,
        candleCount: manifest.candleCount,
        gaps: manifest.gaps
      }, null, 2));
      return;
    }
    const ref = JSON.parse(readFileSync(REF_FILE, "utf8"));
    const resolved = await datasets.resolveDataset(ref);
    console.log(JSON.stringify({
      integrityHash: resolved.manifest.ref.integrityHash,
      revisionWatermark: resolved.manifest.ref.revisionWatermark,
      candleCount: resolved.candles.length,
      openTimes: resolved.candles.map((c) => c.openTime),
      gaps: resolved.manifest.gaps
    }, null, 2));
  } finally {
    await pool.end();
  }
}

void main();
