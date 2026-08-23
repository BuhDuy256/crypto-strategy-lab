// Entry command for the API/WebSocket process role (see
// architecture-baseline.md, "Deployment topology", role 2).
//
// This slice starts plain HTTP with a health endpoint and global DTO
// validation. It intentionally does not touch PostgreSQL, Redis,
// BullMQ, or WebSocket transport; those arrive in later slices.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { StructuredLogger } from "./platform/logger.js";
import { loadRootEnvFile } from "./platform/root-env.js";

const PROCESS_ROLE = "api";
const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  loadRootEnvFile();
  const logger = new StructuredLogger(PROCESS_ROLE);
  const app = await NestFactory.create(AppModule, { logger });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  app.enableShutdownHooks(["SIGTERM", "SIGINT"]);

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  logger.log(`API process listening on port ${port}`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  console.error("Fatal error during API bootstrap:", error);
  process.exit(1);
});
