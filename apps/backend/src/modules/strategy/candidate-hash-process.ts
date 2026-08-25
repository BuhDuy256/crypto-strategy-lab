// Small entry point used only to compute a candidate content hash in a separate
// process, so a test can prove the hash matches across process boundaries (for
// example the API process and the backtest runner process). It reuses the same
// createCandidateStrategy factory, so no hashing logic is duplicated here.
//
// Usage: node --import tsx candidate-hash-process.ts <path-to-input-json>

import { readFileSync } from "node:fs";
import { createCandidateStrategy } from "./application/candidate-strategy-factory.js";
import type { CreateCandidateInput } from "./application/candidate-strategy-factory.js";

const inputPath = process.argv[2];
if (inputPath === undefined) {
  throw new Error("CANDIDATE_HASH_PROCESS: expected a path to an input JSON file");
}

const input = JSON.parse(readFileSync(inputPath, "utf8")) as CreateCandidateInput;
process.stdout.write(createCandidateStrategy(input).contentHash);
