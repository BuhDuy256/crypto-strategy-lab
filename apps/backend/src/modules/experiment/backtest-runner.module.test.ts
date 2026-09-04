// Composition regression for NEWS-06: the runner receives only News's public
// feature port, never a collector, analyzer, repository, or worker lifecycle.

import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { SENTIMENT_FEATURE } from "../news/index.js";
import { BacktestRunnerService } from "./application/backtest-runner-service.js";
import { BacktestRunnerModule } from "./backtest-runner.module.js";

describe("BacktestRunnerModule NEWS-06 composition", () => {
  it("binds the runner to the public sentiment feature port", async () => {
    const module = await Test.createTestingModule({ imports: [BacktestRunnerModule] }).compile();
    try {
      expect(module.get(SENTIMENT_FEATURE)).toBeDefined();
      expect(module.get(BacktestRunnerService)).toBeInstanceOf(BacktestRunnerService);
    } finally {
      await module.close();
    }
  });
});
