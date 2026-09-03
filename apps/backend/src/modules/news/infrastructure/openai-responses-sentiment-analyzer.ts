// OpenAI Responses adapter for the News-owned SentimentAnalyzer port.
//
// The port stays vendor-neutral. This infrastructure adapter owns the exact hosted
// request, strict response validation, and static hosted-service provenance. It never
// logs the item, credential, headers, or raw model response.

import OpenAI from "openai";
import {
  SentimentAnalyzerError,
  type SentimentAnalysisInput,
  type SentimentAnalysisOutput,
  type SentimentAnalyzer
} from "../application/sentiment-analyzer.js";
import { NEWS_SENTIMENT_INPUT_VERSION, type SentimentLabel } from "../domain/sentiment-result.js";

export const OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT = "gpt-4.1-mini-2025-04-14";
export const OPENAI_RESPONSES_SENTIMENT_ENDPOINT = "https://api.openai.com/v1/responses";
export const OPENAI_RESPONSES_SENTIMENT_PROMPT_VERSION = "openai-crypto-news-sentiment-v1";
export const OPENAI_RESPONSES_SENTIMENT_PREPROCESSING_VERSION = "news-sentiment-input-v1";
export const OPENAI_RESPONSES_SENTIMENT_SDK_VERSION = "6.49.0";

const ANALYZER_ID = "openai-responses";
const MAX_OUTPUT_TOKENS = 64;
const REQUEST_TIMEOUT_MS = 10_000;
const LABELS = ["positive", "neutral", "negative"] as const;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "score"],
  properties: {
    label: { type: "string", enum: LABELS },
    score: { type: "number", minimum: 0, maximum: 1 }
  }
};

export const OPENAI_RESPONSES_SENTIMENT_PROVENANCE = {
  modelId: ANALYZER_ID,
  modelArtifactId: `openai://responses/${OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT}`,
  modelVersion: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
  endpoint: OPENAI_RESPONSES_SENTIMENT_ENDPOINT,
  promptVersion: OPENAI_RESPONSES_SENTIMENT_PROMPT_VERSION,
  sdkVersion: OPENAI_RESPONSES_SENTIMENT_SDK_VERSION,
  reproducibility: "not-fully-reproducible",
  reproducibilityReason:
    "The hosted model binary and inference runtime are vendor-controlled and cannot be independently reconstructed."
} as const;

export interface OpenAiResponsesRequest {
  readonly endpoint: string;
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly store: boolean;
  readonly responseFormat: {
    readonly name: string;
    readonly strict: boolean;
    readonly schema: typeof OUTPUT_SCHEMA;
  };
}

export interface OpenAiResponsesResponse {
  readonly status: string;
  readonly model: string;
  readonly outputText: string;
}

/** Narrow client seam: unit tests never instantiate the SDK or make a network request. */
export interface OpenAiResponsesClient {
  create(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse>;
}

/** Creates the SDK-backed client only after the News-worker composition sees a key. */
export function createOpenAiResponsesClient(apiKey: string): OpenAiResponsesClient {
  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });

  return {
    async create(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResponse> {
      const response = await client.responses.create({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        max_output_tokens: request.maxOutputTokens,
        temperature: request.temperature,
        store: request.store,
        text: {
          format: {
            type: "json_schema",
            name: request.responseFormat.name,
            strict: request.responseFormat.strict,
            schema: request.responseFormat.schema
          }
        }
      });

      return {
        status: response.status ?? "unknown",
        model: response.model,
        outputText: response.output_text ?? ""
      };
    }
  };
}

/**
 * Hosted OpenAI adapter. A missing client is deliberate: it turns the empty local
 * credential into the existing retryable durable failure rather than a worker crash.
 */
export class OpenAiResponsesSentimentAnalyzer implements SentimentAnalyzer {
  private readonly modelSnapshot: string;

  constructor(
    private readonly client: OpenAiResponsesClient | undefined,
    modelSnapshot: string = OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT
  ) {
    assertExactModelSnapshot(modelSnapshot);
    this.modelSnapshot = modelSnapshot;
  }

  async analyze(input: SentimentAnalysisInput): Promise<SentimentAnalysisOutput> {
    if (input.inputVersion !== NEWS_SENTIMENT_INPUT_VERSION) {
      throw new SentimentAnalyzerError(
        "UNSUPPORTED_INPUT_VERSION",
        ANALYZER_ID,
        `Input version ${input.inputVersion} is not supported.`
      );
    }
    if (this.client === undefined) {
      throw new SentimentAnalyzerError("ANALYZER_UNAVAILABLE", ANALYZER_ID, "OpenAI credential is missing");
    }

    let response: OpenAiResponsesResponse;
    try {
      response = await this.client.create({
        endpoint: OPENAI_RESPONSES_SENTIMENT_ENDPOINT,
        model: this.modelSnapshot,
        instructions: instructions(),
        input: formatInput(input),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        store: false,
        responseFormat: {
          name: "crypto_news_sentiment",
          strict: true,
          schema: OUTPUT_SCHEMA
        }
      });
    } catch {
      throw new SentimentAnalyzerError(
        "ANALYZER_UNAVAILABLE",
        ANALYZER_ID,
        "OpenAI Responses request failed"
      );
    }

    if (response.status !== "completed" || response.model !== this.modelSnapshot) {
      throw invalidResult();
    }

    const output = parseOutput(response.outputText);
    if (output === undefined) {
      throw invalidResult();
    }

    return {
      label: output.label,
      score: output.score,
      model: {
        modelId: OPENAI_RESPONSES_SENTIMENT_PROVENANCE.modelId,
        modelArtifactId: OPENAI_RESPONSES_SENTIMENT_PROVENANCE.modelArtifactId,
        modelVersion: this.modelSnapshot,
        inputVersion: input.inputVersion,
        preprocessingVersion: OPENAI_RESPONSES_SENTIMENT_PREPROCESSING_VERSION
      }
    };
  }
}

function assertExactModelSnapshot(candidate: string): void {
  if (candidate !== OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT) {
    throw new Error("OPENAI_MODEL_SNAPSHOT_INVALID");
  }
}

function instructions(): string {
  return [
    `Prompt version: ${OPENAI_RESPONSES_SENTIMENT_PROMPT_VERSION}.`,
    "Classify the sentiment of the supplied English crypto-news title and content.",
    "Choose positive for favorable expected crypto-market impact, negative for unfavorable " +
      "impact, and neutral when impact is mixed, unclear, or factual.",
    "Return only the strict JSON schema. Score is an application-level confidence from 0 to 1, " +
      "not a calibrated probability."
  ].join("\n");
}

function formatInput(input: SentimentAnalysisInput): string {
  return `Title:\n${input.item.title}\n\nContent:\n${input.item.content}`;
}

function invalidResult(): SentimentAnalyzerError {
  return new SentimentAnalyzerError(
    "INVALID_ANALYZER_RESULT",
    ANALYZER_ID,
    "OpenAI Responses returned an invalid structured result"
  );
}

function parseOutput(raw: string): { readonly label: SentimentLabel; readonly score: number } | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "label" || keys[1] !== "score") return undefined;
  if (!LABELS.includes(value.label as SentimentLabel)) return undefined;
  if (
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    value.score < 0 ||
    value.score > 1
  ) {
    return undefined;
  }
  return { label: value.label as SentimentLabel, score: value.score };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
