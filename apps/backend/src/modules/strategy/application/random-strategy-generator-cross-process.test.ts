// Proves criterion 2: the same seed and search space produce an identical
// candidate sequence across two separate process runs. One side runs in this
// process; the other runs the real generator via generator-sequence-process.ts.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { RandomStrategyGenerator } from "./random-strategy-generator.js";
import { createBuiltInStrategyRegistry } from "./built-in-strategy-registry.js";
import { createBuiltInCombinationPolicyRegistry } from "./built-in-combination-policy-registry.js";
import type { GenerateRequest, SearchSpace } from "../domain/strategy-generator.js";

const cliPath = fileURLToPath(new URL("../generator-sequence-process.ts", import.meta.url));
const backendDir = fileURLToPath(new URL("../../../../", import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), "generator-seq-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const space: SearchSpace = {
  strategies: [
    { id: "moving-average", version: "1.0.0" },
    { id: "rsi", version: "1.0.0" },
    { id: "bollinger-bands", version: "1.0.0" },
    { id: "support-resistance", version: "1.0.0" }
  ],
  compositeSizes: [1, 2, 3],
  policies: [
    { id: "weighted-score", version: "1.0.0" },
    { id: "majority-vote", version: "1.0.0" }
  ]
};

function sequenceInSeparateProcess(request: GenerateRequest, count: number): string[] {
  const inputPath = join(workDir, "request.json");
  writeFileSync(inputPath, JSON.stringify(request), "utf8");
  const stdout = execFileSync(process.execPath, ["--import", "tsx", cliPath, inputPath, String(count)], {
    cwd: backendDir,
    encoding: "utf8"
  });
  return JSON.parse(stdout) as string[];
}

describe("random generator sequence across processes", () => {
  it("matches the in-process sequence", () => {
    const request: GenerateRequest = { searchSpace: space, seed: "cross-process-seed", configuration: {} };
    const count = 20;

    const generator = new RandomStrategyGenerator(createBuiltInStrategyRegistry(), createBuiltInCombinationPolicyRegistry());
    const inProcess: string[] = [];
    for (const candidate of generator.generate(request)) {
      inProcess.push(candidate.contentHash);
      if (inProcess.length >= count) break;
    }

    const separate = sequenceInSeparateProcess(request, count);

    expect(separate).toHaveLength(count);
    expect(separate).toEqual(inProcess);
  }, 60_000);
});
