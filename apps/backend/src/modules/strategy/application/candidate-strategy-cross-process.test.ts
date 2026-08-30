// Proves the candidate content hash is identical when computed in this process
// and in a separate process (criterion 7: the hash matches in the API process
// and the runner process). The separate process runs the real factory through
// candidate-hash-process.ts, so both sides use the same code.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createCandidateStrategy } from "./candidate-strategy-factory.js";
import type { CreateCandidateInput } from "./candidate-strategy-factory.js";

const cliPath = fileURLToPath(new URL("../candidate-hash-process.ts", import.meta.url));
const backendDir = fileURLToPath(new URL("../../../../", import.meta.url));

const workDir = mkdtempSync(join(tmpdir(), "candidate-hash-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function hashInSeparateProcess(input: CreateCandidateInput): string {
  const inputPath = join(workDir, "input.json");
  writeFileSync(inputPath, JSON.stringify(input), "utf8");
  return execFileSync(process.execPath, ["--import", "tsx", cliPath, inputPath], {
    cwd: backendDir,
    encoding: "utf8"
  }).trim();
}

describe("candidate content hash across processes", () => {
  it("matches the in-process hash", () => {
    const input: CreateCandidateInput = {
      specification: {
        kind: "composite",
        composite: {
          id: "composite-a",
          version: "1.0.0",
          name: "Composite A",
          description: "Cross-process candidate",
          components: [
            { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 20, priceSource: "close" } },
            { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70 } }
          ],
          policy: { id: "weighted-score", version: "1.0.0", configuration: { weights: [0.4, 0.6], threshold: 0.3 } }
        }
      },
      generator: { id: "random-search", version: "1.0.0", configuration: { maxComponents: 3 }, seed: 7 }
    };

    const inProcess = createCandidateStrategy(input).contentHash;
    const separateProcess = hashInSeparateProcess(input);

    expect(separateProcess).toMatch(/^[0-9a-f]{64}$/);
    expect(separateProcess).toBe(inProcess);
  }, 60_000);
});
