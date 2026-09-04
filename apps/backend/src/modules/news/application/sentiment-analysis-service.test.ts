// Static proof that the two news-worker stages meet only in durable state.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ANALYZER_STAGE = readFileSync(
  new URL("./sentiment-analysis-service.ts", import.meta.url),
  "utf8"
);
const COLLECTOR_STAGE = readFileSync(
  new URL("./news-collection-service.ts", import.meta.url),
  "utf8"
);

describe("SentimentAnalysisService architecture", () => {
  it("imports only the result contract, the store port, and the analyzer port", () => {
    const importSpecifiers = [...ANALYZER_STAGE.matchAll(/from\s+["']([^"']+)["']/gu)]
      .map((match) => match[1]);

    expect(importSpecifiers).toEqual([
      "../domain/sentiment-result.js",
      "./sentiment-analysis-store.js",
      "./sentiment-analyzer.js"
    ]);
  });

  it("cannot reach the collector, the provider port, or a dynamic import", () => {
    expect(ANALYZER_STAGE).not.toMatch(
      /NewsCollection|NewsProvider|news-collection|news-provider|import\s*\(/u
    );
  });

  it("names no model, library, vendor, or language", () => {
    for (const token of ["python", "torch", "transformers", "onnx", "openai", "http", "spawn"]) {
      expect(new RegExp(`\\b${token}\\b`, "iu").test(ANALYZER_STAGE)).toBe(false);
    }
  });

  it("leaves the collector unable to reach the analyzer", () => {
    expect(COLLECTOR_STAGE).not.toMatch(
      /SentimentAnalyzer|SentimentAnalysis|sentiment-analy|import\s*\(/u
    );
  });
});
