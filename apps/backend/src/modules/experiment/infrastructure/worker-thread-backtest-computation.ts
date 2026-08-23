// Worker Thread adapter that keeps runner lease orchestration responsive.

import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  BacktestComputation,
  BacktestComputationInput,
  BacktestComputationOutput
} from "../application/backtest-computation.js";

interface WorkerResponse {
  readonly ok: boolean;
  readonly output?: BacktestComputationOutput;
  readonly error?: string;
}

export class WorkerThreadBacktestComputation implements BacktestComputation {
  async compute(
    input: BacktestComputationInput,
    signal?: AbortSignal
  ): Promise<BacktestComputationOutput> {
    if (signal?.aborted) throw new Error("BACKTEST_COMPUTATION_ABORTED");
    const compiledUrl = new URL("./backtest-computation.worker.js", import.meta.url);
    const sourceUrl = new URL("./backtest-computation.worker.ts", import.meta.url);
    const useSource = !existsSync(fileURLToPath(compiledUrl));
    const loaderPath = fileURLToPath(
      new URL("../../../../node_modules/tsx/dist/loader.mjs", import.meta.url)
    );
    const worker = new Worker(useSource ? sourceUrl : compiledUrl, {
      workerData: input,
      ...(useSource ? { execArgv: ["--import", pathToFileURL(loaderPath).href] } : {})
    });
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        void worker.terminate();
        reject(new Error("BACKTEST_COMPUTATION_ABORTED"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      worker.once("message", (message: WorkerResponse) => {
        signal?.removeEventListener("abort", abort);
        void worker.terminate();
        if (message.ok && message.output !== undefined) resolve(message.output);
        else reject(new Error(message.error ?? "BACKTEST_COMPUTATION_FAILED"));
      });
      worker.once("error", (error) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      });
      worker.once("exit", (code) => {
        if (code !== 0 && !signal?.aborted) {
          reject(new Error(`BACKTEST_COMPUTATION_WORKER_EXIT: ${code}`));
        }
      });
    });
  }
}
