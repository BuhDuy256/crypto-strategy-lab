// Configurable polling runtime that drains work and stops gracefully.

import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import type { BacktestRunnerService } from "./backtest-runner-service.js";

export interface RunnerLog {
  log(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

export class BacktestRunnerRuntime {
  private readonly instanceId = randomUUID();
  constructor(
    private readonly runner: BacktestRunnerService,
    private readonly logger: RunnerLog,
    private readonly concurrency: number,
    private readonly pollMilliseconds = 500
  ) {
    if (!Number.isInteger(concurrency) || concurrency <= 0) {
      throw new Error("BACKTEST_RUNNER_CONCURRENCY must be a positive integer");
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    await Promise.all(
      Array.from({ length: this.concurrency }, (_, index) => this.runSlot(index + 1, signal))
    );
  }

  private async runSlot(slot: number, signal: AbortSignal): Promise<void> {
    const runnerId = `${this.instanceId}-${slot}`;
    this.logger.log("Runner slot ready", `runner=${runnerId}`);
    while (!signal.aborted) {
      try {
        const processed = await this.runner.processNext(runnerId, signal);
        if (!processed) await delay(this.pollMilliseconds, undefined, { signal }).catch(() => undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown runner loop failure";
        this.logger.error(message, `runner=${runnerId}`);
        await delay(this.pollMilliseconds, undefined, { signal }).catch(() => undefined);
      }
    }
    this.logger.log("Runner slot stopped gracefully", `runner=${runnerId}`);
  }
}
