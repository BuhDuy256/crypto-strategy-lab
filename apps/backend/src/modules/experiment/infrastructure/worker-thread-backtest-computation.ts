// Worker Thread adapter that keeps runner lease orchestration responsive.

import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  BacktestComputation,
  BacktestComputationInput,
  BacktestComputationOutput
} from "../application/backtest-computation.js";
import type { CompositeStrategyService, StrategyRegistry } from "../../strategy/index.js";

interface WorkerResponse {
  readonly ok: boolean;
  readonly output?: BacktestComputationOutput;
  readonly error?: string;
}

export class WorkerThreadBacktestComputation implements BacktestComputation {
  constructor(
    private readonly strategies?: StrategyRegistry,
    private readonly composites?: CompositeStrategyService
  ) {}

  async compute(
    input: BacktestComputationInput,
    signal?: AbortSignal
  ): Promise<BacktestComputationOutput> {
    if (signal?.aborted) throw new Error("BACKTEST_COMPUTATION_ABORTED");
    const compiledUrl = new URL("./backtest-computation.worker.js", import.meta.url);
    const sourceUrl = new URL("./backtest-computation.worker.ts", import.meta.url);
    const useSource = !existsSync(fileURLToPath(compiledUrl));
    const tsconfigPath = fileURLToPath(new URL("../../../../tsconfig.json", import.meta.url));
    const sourceBootstrap = new URL(
      `data:text/javascript,${encodeURIComponent(`
        import { tsImport } from ${JSON.stringify(
          new URL("../../../../node_modules/tsx/dist/esm/api/index.mjs", import.meta.url).href
        )};
        await tsImport(${JSON.stringify(sourceUrl.href)}, {
          parentURL: import.meta.url,
          tsconfig: ${JSON.stringify(tsconfigPath)}
        });
      `)}`
    );
    let workerInput = input;
    const inlineDefinition = input.specification.content.compositeDefinition;
    if (inlineDefinition !== undefined) {
      // A generated composite carries its definition inline; prefer it over a
      // saved-store lookup so the run never depends on a saved-composite record.
      workerInput = { ...input, compositeDefinition: inlineDefinition };
    } else if (this.strategies !== undefined && this.composites !== undefined) {
      try {
        this.strategies.resolve(input.specification.content.strategy);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("STRATEGY_NOT_FOUND:")) throw error;
        const definition = await this.composites.load(input.specification.content.strategy.id);
        if (definition.version !== input.specification.content.strategy.version) {
          throw new Error(
            `COMPOSITE_VERSION_MISMATCH: expected ${definition.version}, received ${input.specification.content.strategy.version}`
          );
        }
        workerInput = { ...input, compositeDefinition: definition };
      }
    }
    const worker = new Worker(useSource ? sourceBootstrap : compiledUrl, {
      workerData: workerInput,
      env: { ...process.env, TSX_TSCONFIG: tsconfigPath }
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
