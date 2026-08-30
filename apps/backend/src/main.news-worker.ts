// Entry command for the isolated News collection worker process role.

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NewsWorkerModule, NewsWorkerRuntime } from "./modules/news/index.js";
import { loadRootEnvFile } from "./platform/root-env.js";

async function main(): Promise<void> {
  loadRootEnvFile();
  const arguments_ = process.argv.slice(2);
  const allowed = new Set(["--once", "--analyze-once"]);
  if (arguments_.some((argument) => !allowed.has(argument))) {
    throw new Error("News worker accepts only the optional --once or --analyze-once argument.");
  }
  const context = await NestFactory.createApplicationContext(NewsWorkerModule, { logger: false });
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const stopFromParent = (message: unknown): void => {
    if (message === "shutdown") stop();
  };
  process.on("message", stopFromParent);

  try {
    const runtime = context.get(NewsWorkerRuntime);
    if (arguments_.includes("--once")) {
      await runtime.collectOnce();
    } else if (arguments_.includes("--analyze-once")) {
      await runtime.analyzeOnce();
    } else {
      await runtime.run(controller.signal);
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
