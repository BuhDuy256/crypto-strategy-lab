// Entry command for the isolated News worker process role.
// `--once` uses the collection-only graph; analysis and normal mode use the full worker.

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  NewsCollectionWorkerModule,
  NewsCollectionWorkerRuntime,
  NewsWorkerModule,
  NewsWorkerRuntime
} from "./modules/news/index.js";
import { loadRootEnvFile } from "./platform/root-env.js";

async function main(): Promise<void> {
  loadRootEnvFile();
  const arguments_ = process.argv.slice(2);
  const allowed = new Set(["--once", "--analyze-once"]);
  if (arguments_.some((argument) => !allowed.has(argument))) {
    throw new Error("News worker accepts only the optional --once or --analyze-once argument.");
  }
  const collectionOnly = arguments_.includes("--once");
  const context = await NestFactory.createApplicationContext(
    collectionOnly ? NewsCollectionWorkerModule : NewsWorkerModule,
    { logger: false }
  );
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const stopFromParent = (message: unknown): void => {
    if (message === "shutdown") stop();
  };
  process.on("message", stopFromParent);

  try {
    if (collectionOnly) {
      await context.get(NewsCollectionWorkerRuntime).collectOnce();
    } else if (arguments_.includes("--analyze-once")) {
      await context.get(NewsWorkerRuntime).analyzeOnce();
    } else {
      await context.get(NewsWorkerRuntime).run(controller.signal);
    }
  } finally {
    process.off("message", stopFromParent);
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error("News worker failed:", error);
  process.exitCode = 1;
});
