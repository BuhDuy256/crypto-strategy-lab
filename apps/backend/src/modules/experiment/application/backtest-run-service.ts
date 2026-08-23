// Application orchestration for durable, idempotent backtest submission.

import { randomUUID } from "node:crypto";
import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type { ExperimentSpecificationService } from "./experiment-specification-service.js";

export type BacktestRunStatus = "queued" | "running" | "completed" | "failed";

export interface BacktestRun {
  readonly runId: string;
  readonly specId: string;
  readonly candidateId: string;
  readonly idempotencyKey: string;
  readonly status: BacktestRunStatus;
  readonly failureReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BacktestJob {
  readonly jobId: string;
  readonly runId: string;
  readonly specId: string;
  readonly candidateId: string;
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface BacktestExecutor {
  enqueue(job: BacktestJob): Promise<void>;
}

export interface ClaimedBacktestJob {
  readonly run: BacktestRun;
  readonly job: BacktestJob;
  readonly attempt: number;
  readonly leaseExpiresAt: string;
  readonly runnerId: string;
}

export interface BacktestRunStore {
  createOrGet(input: {
    runId: string; specId: string; candidateId: string; idempotencyKey: string; correlationId: string;
  }): Promise<{ run: BacktestRun; created: boolean }>;
  find(runId: string): Promise<BacktestRun | undefined>;
}

export class BacktestRunService {
  constructor(
    private readonly specifications: ExperimentSpecificationService,
    private readonly runs: BacktestRunStore,
    private readonly executor: BacktestExecutor
  ) {}

  async start(specId: string, correlationId: string): Promise<BacktestRun> {
    const specification = await this.specifications.get(specId);
    if (specification.status !== "frozen") {
      throw new Error(`EXPERIMENT_NOT_FROZEN: ${specId}`);
    }
    const candidateId = canonicalSha256({
      id: specification.content.strategy.id,
      version: specification.content.strategy.version,
      parameters: specification.content.strategy.parameters
    });
    const provenance = specification.content.provenance;
    const idempotencyKey = canonicalSha256({
      specificationHash: specification.contentHash,
      engine: provenance.engine,
      deterministicConfigVersion: provenance.deterministicConfigVersion,
      workerBuildIdentity: provenance.workerCommit
    });
    const runId = randomUUID();
    const result = await this.runs.createOrGet({ runId, specId, candidateId, idempotencyKey, correlationId });
    if (result.created) {
      await this.executor.enqueue({
        jobId: result.run.runId, runId: result.run.runId, specId, candidateId,
        attempt: 1, idempotencyKey, correlationId
      });
    }
    return result.run;
  }

  async get(runId: string): Promise<BacktestRun> {
    const run = await this.runs.find(runId);
    if (run === undefined) throw new Error(`BACKTEST_RUN_NOT_FOUND: ${runId}`);
    return run;
  }
}
