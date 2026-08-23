// Worker Thread entry that performs CPU-bound strategy evaluation and backtesting.

import { parentPort, workerData } from "node:worker_threads";
import { createBuiltInStrategyRegistry } from "../../strategy/index.js";
import {
  computeBacktest,
  type BacktestComputationInput
} from "../application/backtest-computation.js";

if (parentPort === null) throw new Error("BACKTEST_WORKER_PORT: parent port is required");

try {
  parentPort.postMessage({
    ok: true,
    output: computeBacktest(workerData as BacktestComputationInput, createBuiltInStrategyRegistry())
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : "Unknown computation failure"
  });
}
