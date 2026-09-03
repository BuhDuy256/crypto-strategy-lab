// Behavior tests for the hosted OpenAI adapter without a network client.

import { describe, expect, it } from "vitest";
import { NEWS_SENTIMENT_INPUT_VERSION } from "../domain/sentiment-result.js";
import { newsItemFixture } from "../testing/news-item-fixture.js";
import {
  OPENAI_RESPONSES_SENTIMENT_ENDPOINT,
  OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
  OPENAI_RESPONSES_SENTIMENT_PROVENANCE,
  OpenAiResponsesSentimentAnalyzer,
  type OpenAiResponsesClient,
  type OpenAiResponsesRequest,
  type OpenAiResponsesResponse
} from "./openai-responses-sentiment-analyzer.js";

class FakeOpenAiResponsesClient implements OpenAiResponsesClient {
  readonly requests: OpenAiResponsesRequest[] = [];

  constructor(
    private readonly result: OpenAiResponsesResponse | Error
  ) {}

  async create(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse> {
    this.requests.push(request);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function successfulResponse(outputText: string): OpenAiResponsesResponse {
  return {
    status: "completed",
    model: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
    outputText
  };
}

function analyzerWith(outputText: string): {
  readonly analyzer: OpenAiResponsesSentimentAnalyzer;
  readonly client: FakeOpenAiResponsesClient;
} {
  const client = new FakeOpenAiResponsesClient(successfulResponse(outputText));
  return { analyzer: new OpenAiResponsesSentimentAnalyzer(client), client };
}

describe("OpenAiResponsesSentimentAnalyzer", () => {
  it.each([
    ["positive", 0.91],
    ["neutral", 0.5],
    ["negative", 0.08]
  ] as const)("returns a valid %s result", async (label, score) => {
    const { analyzer } = analyzerWith(JSON.stringify({ label, score }));
    const item = newsItemFixture();

    await expect(
      analyzer.analyze({ item, inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
    ).resolves.toEqual({
      label,
      score,
      model: {
        modelId: "openai-responses",
        modelArtifactId: "openai://responses/gpt-4.1-mini-2025-04-14",
        modelVersion: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
        inputVersion: NEWS_SENTIMENT_INPUT_VERSION,
        preprocessingVersion: "news-sentiment-input-v1"
      }
    });
  });

  it.each([0, 1])("accepts confidence score boundary %s", async (score) => {
    const { analyzer } = analyzerWith(JSON.stringify({ label: "neutral", score }));

    await expect(
      analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
    ).resolves.toMatchObject({ score });
  });

  it.each([
    "not json",
    JSON.stringify({ label: "positive" }),
    JSON.stringify({ label: "positive", score: 0.5, extra: true }),
    JSON.stringify({ label: "mixed", score: 0.5 }),
    JSON.stringify({ label: "positive", score: -0.001 }),
    JSON.stringify({ label: "positive", score: 1.001 })
  ])("rejects malformed or invalid structured output", async (outputText) => {
    const { analyzer } = analyzerWith(outputText);

    await expect(
      analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
    ).rejects.toMatchObject({ code: "INVALID_ANALYZER_RESULT" });
  });

  it("rejects an empty or incomplete response", async () => {
    const empty = analyzerWith("").analyzer;
    const incomplete = new OpenAiResponsesSentimentAnalyzer(
      new FakeOpenAiResponsesClient({
        status: "incomplete",
        model: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
        outputText: ""
      })
    );
    const input = { item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION };

    await expect(empty.analyze(input)).rejects.toMatchObject({ code: "INVALID_ANALYZER_RESULT" });
    await expect(incomplete.analyze(input)).rejects.toMatchObject({
      code: "INVALID_ANALYZER_RESULT"
    });
  });

  it.each([
    new Error("timeout"),
    Object.assign(new Error("rate limited"), { status: 429 }),
    Object.assign(new Error("unauthorized"), { status: 401 }),
    Object.assign(new Error("upstream failure"), { status: 500 })
  ])("maps client availability failures to the stable port error", async (failure) => {
    const analyzer = new OpenAiResponsesSentimentAnalyzer(
      new FakeOpenAiResponsesClient(failure)
    );

    await expect(
      analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
    ).rejects.toMatchObject({ code: "ANALYZER_UNAVAILABLE", analyzer: "openai-responses" });
  });

  it("uses the exact snapshot and strict request schema", async () => {
    const { analyzer, client } = analyzerWith(JSON.stringify({ label: "positive", score: 0.8 }));
    const item = newsItemFixture({ title: "Bitcoin adoption rises", content: "Institutional demand gains." });

    await analyzer.analyze({ item, inputVersion: NEWS_SENTIMENT_INPUT_VERSION });

    expect(client.requests).toEqual([
      expect.objectContaining({
        model: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
        temperature: 0,
        maxOutputTokens: 64,
        store: false,
        endpoint: OPENAI_RESPONSES_SENTIMENT_ENDPOINT,
        responseFormat: expect.objectContaining({
          name: "crypto_news_sentiment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["label", "score"],
            properties: {
              label: { type: "string", enum: ["positive", "neutral", "negative"] },
              score: { type: "number", minimum: 0, maximum: 1 }
            }
          }
        })
      })
    ]);
    expect(client.requests[0]?.instructions).toContain("openai-crypto-news-sentiment-v1");
    expect(client.requests[0]?.input).toContain(item.title);
    expect(client.requests[0]?.input).toContain(item.content);
  });

  it.each(["gpt-4.1-mini", "latest", "stable", "default"])(
    "rejects moving model identifier %s",
    (model) => {
      expect(() => new OpenAiResponsesSentimentAnalyzer(undefined, model)).toThrow(
        "OPENAI_MODEL_SNAPSHOT_INVALID"
      );
    }
  );

  it("rejects a substituted response model without a fallback", async () => {

    const client = new FakeOpenAiResponsesClient({
      status: "completed",
      model: "gpt-4.1-mini",
      outputText: JSON.stringify({ label: "positive", score: 0.8 })
    });
    const analyzer = new OpenAiResponsesSentimentAnalyzer(client);

    await expect(
      analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
    ).rejects.toMatchObject({ code: "INVALID_ANALYZER_RESULT" });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.model).toBe(OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT);
  });

  it("exposes honest hosted-service provenance metadata", () => {
    expect(OPENAI_RESPONSES_SENTIMENT_PROVENANCE).toMatchObject({
      promptVersion: "openai-crypto-news-sentiment-v1",
      sdkVersion: "6.49.0",
      reproducibility: "not-fully-reproducible"
    });
    expect(OPENAI_RESPONSES_SENTIMENT_PROVENANCE.reproducibilityReason).toContain(
      "vendor-controlled"
    );
  });

  it("reports a missing credential through the existing availability boundary", async () => {
    const analyzer = new OpenAiResponsesSentimentAnalyzer(undefined);

    await expect(
      analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "ANALYZER_UNAVAILABLE",
        analyzer: "openai-responses",
        message: "OpenAI credential is missing"
      })
    );
  });

  it("keeps the existing input-version seam", async () => {
    const { analyzer } = analyzerWith(JSON.stringify({ label: "positive", score: 0.8 }));

    await expect(
      analyzer.analyze({ item: newsItemFixture(), inputVersion: "news-sentiment-input-v1" })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT_VERSION" });
  });

  it("never exposes upstream error text through the port failure", async () => {
    const analyzer = new OpenAiResponsesSentimentAnalyzer(
      new FakeOpenAiResponsesClient(new Error("Bearer secret-must-not-appear"))
    );

    await expect(
      analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "ANALYZER_UNAVAILABLE",
        message: "OpenAI Responses request failed"
      })
    );
  });
});
