// Entry command for the separate V1 PostgreSQL-backed backtest runner process.

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { BacktestRunnerModule, BacktestRunnerRuntime } from "./modules/experiment/index.js";
import { loadRootEnvFile } from "./platform/root-env.js";

async function main(): Promise<void> {
  loadRootEnvFile();
  for (const name of [
    "DEPENDENCY_LOCK_HASH",
    "APPLICATION_COMMIT",
    "WORKER_COMMIT",
    "DETERMINISTIC_CONFIG_VERSION"
  ]) {
    const value = process.env[name];
    if (value === undefined) throw new Error(`${name} is required by the backtest runner`);
    if (value.trim() === "" || value.startsWith("replace-with-") || value === "latest") {
      throw new Error(`${name} must be an explicit build value`);
    }
  }
  if (!/^[0-9a-f]{64}$/.test(process.env.DEPENDENCY_LOCK_HASH ?? "")) {
    throw new Error("DEPENDENCY_LOCK_HASH must be a SHA-256 hash");
  }
  const context = await NestFactory.createApplicationContext(BacktestRunnerModule, { logger: false });
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  // Node on Windows cannot deliver POSIX SIGTERM handlers reliably. An IPC parent
  // may request the same graceful path; production containers continue to use signals.
  const stopFromParent = (message: unknown): void => {
    if (message === "shutdown") stop();
  };
  process.on("message", stopFromParent);
  try {
    await context.get(BacktestRunnerRuntime).run(controller.signal);
  } finally {
    process.off("message", stopFromParent);
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error("Backtest runner failed:", error);
  process.exitCode = 1;
});
