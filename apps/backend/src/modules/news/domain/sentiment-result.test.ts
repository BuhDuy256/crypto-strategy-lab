// Versioned SentimentResult validation, including the provenance alias ban.
import { describe, expect, it } from "vitest";
import {
  MODEL_ALIASES_FORBIDDEN_IN_PROVENANCE,
  NEWS_SENTIMENT_INPUT_VERSION,
  SENTIMENT_RESULT_SCHEMA_VERSION,
  normalizeSentimentResult,
  type SentimentModelProvenance
} from "./sentiment-result.js";

const PROVENANCE: SentimentModelProvenance = {
  modelId: "fake-lexicon",
  modelArtifactId: "sha256:0ac9f1b2",
  modelVersion: "1.4.0",
  inputVersion: NEWS_SENTIMENT_INPUT_VERSION,
  preprocessingVersion: "lowercase-token.v2"
};

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: SENTIMENT_RESULT_SCHEMA_VERSION,
    newsItemId: "coindesk-rss|https://www.coindesk.com/fixture/first",
    label: "positive",
    score: 0.62,
    model: PROVENANCE,
    analyzedAt: Date.UTC(2026, 7, 30, 2, 0, 0),
    status: "succeeded",
    ...overrides
  };
}

describe("normalizeSentimentResult", () => {
  it("accepts a result carrying the full version set", () => {
    const result = normalizeSentimentResult(candidate());

    expect(result).toEqual({
      kind: "accepted",
      result: {
        schemaVersion: SENTIMENT_RESULT_SCHEMA_VERSION,
        newsItemId: "coindesk-rss|https://www.coindesk.com/fixture/first",
        label: "positive",
        score: 0.62,
        model: PROVENANCE,
        analyzedAt: Date.UTC(2026, 7, 30, 2, 0, 0),
        status: "succeeded"
      }
    });
  });

  it("rejects a result whose schema version is not the current one", () => {
    expect(normalizeSentimentResult(candidate({ schemaVersion: 99 }))).toEqual({
      kind: "rejected",
      reason: "SCHEMA_VERSION_INVALID"
    });
  });

  it("rejects a label outside the three sentiment labels", () => {
    expect(normalizeSentimentResult(candidate({ label: "bullish" }))).toEqual({
      kind: "rejected",
      reason: "LABEL_INVALID"
    });
  });

  it("rejects a score outside the closed interval from minus one to one", () => {
    expect(normalizeSentimentResult(candidate({ score: 1.01 }))).toEqual({
      kind: "rejected",
      reason: "SCORE_INVALID"
    });
  });

  it("rejects provenance that is missing any version field", () => {
    const incomplete = { ...PROVENANCE, preprocessingVersion: "" };

    expect(normalizeSentimentResult(candidate({ model: incomplete }))).toEqual({
      kind: "rejected",
      reason: "PROVENANCE_INCOMPLETE"
    });
  });

  it.each([...MODEL_ALIASES_FORBIDDEN_IN_PROVENANCE])(
    "rejects the model alias %s recorded as a model version",
    (alias) => {
      const aliased = { ...PROVENANCE, modelVersion: alias };

      expect(normalizeSentimentResult(candidate({ model: aliased }))).toEqual({
        kind: "rejected",
        reason: "PROVENANCE_ALIAS_FORBIDDEN"
      });
    }
  );

  it("rejects an alias hidden as one segment of an artefact identity", () => {
    const aliased = { ...PROVENANCE, modelArtifactId: "fake-lexicon:latest" };

    expect(normalizeSentimentResult(candidate({ model: aliased }))).toEqual({
      kind: "rejected",
      reason: "PROVENANCE_ALIAS_FORBIDDEN"
    });
  });

  it("accepts a version that merely contains alias letters inside a longer word", () => {
    const notAnAlias = { ...PROVENANCE, modelVersion: "2.0.0-stableish" };

    expect(normalizeSentimentResult(candidate({ model: notAnAlias }))).toMatchObject({
      kind: "accepted"
    });
  });

  it("rejects an analyzed timestamp that is not a UTC epoch millisecond", () => {
    expect(normalizeSentimentResult(candidate({ analyzedAt: "2026-08-30T02:00:00Z" }))).toEqual({
      kind: "rejected",
      reason: "ANALYZED_AT_INVALID"
    });
  });

  it("rejects a non-object candidate", () => {
    expect(normalizeSentimentResult(null)).toEqual({
      kind: "rejected",
      reason: "RESULT_NOT_AN_OBJECT"
    });
  });
});
