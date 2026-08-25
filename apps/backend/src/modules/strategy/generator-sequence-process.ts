// Emits the first N candidate content hashes of a random-search run in a
// separate process, so a test can prove the sequence is identical across
// processes. It reuses the real generator and built-in registries; nothing is
// duplicated here.
//
// Usage: node --import tsx generator-sequence-process.ts <request-json> <count>

import { readFileSync } from "node:fs";
import { createBuiltInStrategyRegistry } from "./application/built-in-strategy-registry.js";
import { createBuiltInCombinationPolicyRegistry } from "./application/built-in-combination-policy-registry.js";
import { RandomStrategyGenerator } from "./application/random-strategy-generator.js";
import type { GenerateRequest } from "./domain/strategy-generator.js";

const inputPath = process.argv[2];
const countArg = process.argv[3];
if (inputPath === undefined || countArg === undefined) {
  throw new Error("GENERATOR_SEQUENCE_PROCESS: expected <request-json> and <count> arguments");
}

const request = JSON.parse(readFileSync(inputPath, "utf8")) as GenerateRequest;
const count = Number(countArg);
const generator = new RandomStrategyGenerator(
  createBuiltInStrategyRegistry(),
  createBuiltInCombinationPolicyRegistry()
);

const hashes: string[] = [];
for (const candidate of generator.generate(request)) {
  hashes.push(candidate.contentHash);
  if (hashes.length >= count) break;
}
process.stdout.write(JSON.stringify(hashes));
