// Static proof that the SentimentAnalyzer port names no model, library, vendor, or language.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PORT_SOURCE = readFileSync(new URL("./sentiment-analyzer.ts", import.meta.url), "utf8");

// Tokens that would tie the port to one implementation technology instead of a contract.
const IMPLEMENTATION_TOKENS = [
  "python", "pytorch", "torch", "tensorflow", "keras", "transformers", "huggingface",
  "onnx", "sklearn", "spacy", "nltk", "vader", "bert", "gpt", "llama", "openai",
  "anthropic", "azure", "aws", "gcp", "http", "https", "fetch", "axios", "grpc",
  "child_process", "spawn", "exec", "pip", "conda", "wasm", "sidecar", "rest"
];

describe("SentimentAnalyzer port", () => {
  it("imports only News domain contracts", () => {
    const importSpecifiers = [...PORT_SOURCE.matchAll(/from\s+["']([^"']+)["']/gu)]
      .map((match) => match[1]);

    expect(importSpecifiers).toEqual(["../domain/news-item.js", "../domain/sentiment-result.js"]);
  });

  it("names no model, library, vendor, or language in its signature", () => {
    for (const token of IMPLEMENTATION_TOKENS) {
      expect(
        new RegExp(`\\b${token}\\b`, "iu").test(PORT_SOURCE),
        `port must not name "${token}"`
      ).toBe(false);
    }
  });

  it("reaches no framework, transport, or process boundary", () => {
    expect(PORT_SOURCE).not.toMatch(/@nestjs|node:|require\s*\(|import\s*\(/u);
  });
});
