// Composition root for the normal News worker.
// Collection and analysis meet only through News-owned durable state.

import { Module } from "@nestjs/common";
import type { Pool } from "pg";
import { loadConfig } from "../../platform/config.js";
import { StructuredLogger } from "../../platform/logger.js";
import type { SentimentAnalyzer } from "./application/sentiment-analyzer.js";
import { NewsCollectionScheduler } from "./application/news-collection-service.js";
import {
  SentimentAnalysisScheduler,
  SentimentAnalysisService
} from "./application/sentiment-analysis-service.js";
import { NewsWorkerRuntime } from "./application/news-worker-runtime.js";
import {
  NewsCollectionWorkerModule,
  NEWS_COLLECTION_WORKER_DATABASE_POOL as NEWS_WORKER_DATABASE_POOL,
  NEWS_COLLECTION_WORKER_LOGGER as NEWS_WORKER_LOGGER
} from "./news-collection-worker.module.js";
import {
  createOpenAiResponsesClient,
  OpenAiResponsesSentimentAnalyzer
} from "./infrastructure/openai-responses-sentiment-analyzer.js";
import { PostgresSentimentAnalysisRepository } from "./infrastructure/postgres-sentiment-analysis-repository.js";
import { PostgresNewsWorkerHeartbeat } from "./infrastructure/postgres-news-worker-heartbeat.js";

export { NEWS_WORKER_DATABASE_POOL, NEWS_WORKER_LOGGER };
/** The one binding NEWS-04 changes when a real analyzer is chosen. */
export const SENTIMENT_ANALYZER = Symbol("SENTIMENT_ANALYZER");

const PROCESS_ROLE = "news-worker";

@Module({
  imports: [NewsCollectionWorkerModule],
  providers: [
    {
      provide: PostgresSentimentAnalysisRepository,
      inject: [NEWS_WORKER_DATABASE_POOL],
      useFactory: (pool: Pool): PostgresSentimentAnalysisRepository =>
        new PostgresSentimentAnalysisRepository(pool, {
          leaseSeconds: loadConfig().news.sentimentAnalysis.leaseSeconds
        })
    },
    {
      provide: SENTIMENT_ANALYZER,
      useFactory: (): SentimentAnalyzer => {
        // The credential is deliberately read only in the News-worker composition.
        // An empty value leaves the worker alive; the adapter records a retryable
        // analyzer failure when a pending item reaches the analysis stage.
        const apiKey = process.env.OPENAI_API_KEY ?? "";
        const client = apiKey.trim() === "" ? undefined : createOpenAiResponsesClient(apiKey);
        return new OpenAiResponsesSentimentAnalyzer(client);
      }
    },
    {
      provide: PostgresNewsWorkerHeartbeat,
      inject: [NEWS_WORKER_DATABASE_POOL, NEWS_WORKER_LOGGER],
      useFactory: (pool: Pool, logger: StructuredLogger): PostgresNewsWorkerHeartbeat => {
        const collectionPollIntervalMs = loadConfig().news.coinDeskRss.pollIntervalMs;
        // Reporting halfway through a collection interval keeps liveness independent
        // from a provider request that may still be running at the next poll tick.
        return new PostgresNewsWorkerHeartbeat(pool, collectionPollIntervalMs / 2, logger);
      }
    },
    {
      provide: SentimentAnalysisService,
      inject: [SENTIMENT_ANALYZER, PostgresSentimentAnalysisRepository, NEWS_WORKER_LOGGER],
      useFactory: (
        analyzer: SentimentAnalyzer,
        store: PostgresSentimentAnalysisRepository,
        logger: StructuredLogger
      ): SentimentAnalysisService => {
        const policy = loadConfig().news.sentimentAnalysis;
        return new SentimentAnalysisService(
          analyzer,
          store,
          { maxAttempts: policy.maxAttempts, batchSize: policy.batchSize },
          `${PROCESS_ROLE}-${process.pid}`,
          logger
        );
      }
    },
    {
      provide: SentimentAnalysisScheduler,
      inject: [SentimentAnalysisService],
      useFactory: (stage: SentimentAnalysisService): SentimentAnalysisScheduler =>
        new SentimentAnalysisScheduler(
          stage,
          loadConfig().news.sentimentAnalysis.pollIntervalMs
        )
    },
    {
      provide: NewsWorkerRuntime,
      inject: [
        NewsCollectionScheduler,
        SentimentAnalysisScheduler,
        PostgresNewsWorkerHeartbeat,
        NEWS_WORKER_LOGGER
      ],
      useFactory: (
        schedule: NewsCollectionScheduler,
        analysis: SentimentAnalysisScheduler,
        heartbeat: PostgresNewsWorkerHeartbeat,
        logger: StructuredLogger
      ): NewsWorkerRuntime => new NewsWorkerRuntime(schedule, analysis, heartbeat, logger)
    }
  ],
  exports: [NewsWorkerRuntime]
})
export class NewsWorkerModule {}
