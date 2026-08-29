// Entry command for the market ingest process role (see
// architecture-baseline.md, "Deployment topology", the market ingest role).
//
// This process is separate from the API on purpose: it holds a long-lived
// Binance WebSocket connection, and a provider connection must never compete
// with interactive HTTP or client WebSocket traffic. It writes closed candles
// to PostgreSQL, which stays the authoritative truth, and publishes live
// notifications to Redis Pub/Sub, which is best-effort and at-most-once.

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { MarketIngestModule, MarketIngestRuntime } from "./modules/market/index.js";
import { loadRootEnvFile } from "./platform/root-env.js";

async function main(): Promise<void> {
  loadRootEnvFile();
  const context = await NestFactory.createApplicationContext(MarketIngestModule, { logger: false });
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  // Node on Windows cannot deliver POSIX SIGTERM handlers reliably. An IPC
  // parent may request the same graceful path; containers still use signals.
  const stopFromParent = (message: unknown): void => {
    if (message === "shutdown") stop();
  };
  process.on("message", stopFromParent);

  try {
    await context.get(MarketIngestRuntime).run(controller.signal);
  } finally {
    process.off("message", stopFromParent);
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error("Market ingest failed:", error);
  process.exitCode = 1;
});
