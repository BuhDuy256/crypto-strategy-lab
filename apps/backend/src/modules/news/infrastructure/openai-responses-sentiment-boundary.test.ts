// Static boundary checks for OpenAI credential and adapter isolation.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKER_MODULE = readFileSync(new URL("../news-worker.module.ts", import.meta.url), "utf8");
const API_ENTRY = readFileSync(new URL("../../../main.api.ts", import.meta.url), "utf8");
const API_MODULE = readFileSync(new URL("../../api/api.module.ts", import.meta.url), "utf8");
const COLLECTOR = readFileSync(
  new URL("../application/news-collection-service.ts", import.meta.url),
  "utf8"
);

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("OpenAI Responses adapter boundary", () => {
  it("binds the adapter and reads its credential only in News-worker composition", () => {
    expect(WORKER_MODULE).toContain("OpenAiResponsesSentimentAnalyzer");
    expect(WORKER_MODULE).toContain("OPENAI_API_KEY");

    const credentialSources = sourceFiles(SOURCE_ROOT).filter((path) =>
      readFileSync(path, "utf8").includes("OPENAI_API_KEY")
    );
    expect(credentialSources.map((path) => path.replaceAll("\\", "/"))).toEqual([
      expect.stringMatching(/src\/modules\/news\/news-worker\.module\.ts$/u)
    ]);
  });

  it("keeps the adapter out of API, collector, Strategy, and Experiment sources", () => {
    expect(`${API_ENTRY}\n${API_MODULE}`).not.toMatch(/OpenAiResponses|openai-responses/u);
    expect(COLLECTOR).not.toMatch(/OpenAiResponses|openai-responses/u);

    const outsideNews = [
      ...sourceFiles(join(SOURCE_ROOT, "modules", "strategy")),
      ...sourceFiles(join(SOURCE_ROOT, "modules", "experiment"))
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(outsideNews).not.toMatch(/OpenAiResponses|openai-responses/u);
  });
});
