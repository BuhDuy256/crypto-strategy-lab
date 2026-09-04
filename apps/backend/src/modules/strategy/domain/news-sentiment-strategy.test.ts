// NEWS-06 contract: a registered Strategy consumes only its declared sentiment series.

import { describe, expect, it } from "vitest";
import { createBuiltInStrategyRegistry } from "../application/built-in-strategy-registry.js";
import { StrategyRegistry } from "../application/strategy-registry.js";
import { createBuiltInCombinationPolicyRegistry } from "../application/built-in-combination-policy-registry.js";
import { CompositeStrategy } from "./composite-strategy.js";
import { MAStrategy } from "./ma-strategy.js";
import { NewsSentimentStrategy } from "./news-sentiment-strategy.js";

const parameters = {
  positiveThreshold: 0.2,
  negativeThreshold: -0.2,
  windowDurationMs: 3_600_000
};

function context(score: number) {
  return {
    evaluationTime: 3_600_000,
    inputs: [{ kind: "sentiment-series" as const, points: [{ time: 3_600_000, score }] }]
  };
}

describe("NewsSentimentStrategy", () => {
  it("declares the threshold and window parameters plus its sentiment dependency", () => {
    expect(new NewsSentimentStrategy().descriptor).toMatchObject({
      id: "news-sentiment",
      version: "1.0.0",
      category: "sentiment",
      requiredInputs: ["sentiment-series"],
      parameterSchema: { required: ["positiveThreshold", "negativeThreshold", "windowDurationMs"] }
    });
  });

  it("appears in the built-in strategy catalog", () => {
    expect(createBuiltInStrategyRegistry().list()).toContainEqual(expect.objectContaining({
      id: "news-sentiment",
      version: "1.0.0",
      requiredInputs: ["sentiment-series"]
    }));
  });

  it.each([
    ["buy", 0.3],
    ["sell", -0.3],
    ["hold", 0.2],
    ["hold", -0.2],
    ["hold", 0]
  ] as const)("returns %s when the latest sentiment score is %s", (action, score) => {
    const registry = new StrategyRegistry([new NewsSentimentStrategy()]);

    expect(registry.resolve({ id: "news-sentiment", version: "1.0.0" }).run(context(score), parameters))
      .toMatchObject({ signal: { action, effectiveTime: 3_600_000 } });
  });

  it("requires the declared sentiment series rather than fetching News data", () => {
    const registry = new StrategyRegistry([new NewsSentimentStrategy()]);

    expect(() => registry.resolve({ id: "news-sentiment", version: "1.0.0" }).run({
      evaluationTime: 3_600_000,
      inputs: []
    }, parameters)).toThrow("STRATEGY_INPUT_REQUIRED: missing input sentiment-series");
  });

  it("combines with a technical strategy through the existing composite policy", () => {
    const sentiment = new NewsSentimentStrategy();
    const technical = new MAStrategy();
    const composite = new CompositeStrategy(
      {
        id: "news-plus-ma", version: "1.0.0", name: "News plus MA", description: "Fixture",
        components: [
          { id: sentiment.descriptor.id, version: sentiment.descriptor.version, parameters },
          {
            id: technical.descriptor.id,
            version: technical.descriptor.version,
            parameters: { fastPeriod: 2, slowPeriod: 3, priceSource: "close" }
          }
        ],
        policy: { id: "majority-vote", version: "1.0.0", configuration: {} }
      },
      [sentiment, technical],
      createBuiltInCombinationPolicyRegistry().resolve({ id: "majority-vote", version: "1.0.0" })
    );

    expect(composite.evaluate({
      evaluationTime: 3_600_000,
      inputs: [
        { kind: "sentiment-series", points: [{ time: 3_600_000, score: 0.4 }] },
        {
          kind: "price-bars",
          bars: [1, 2, 3].map((close, index) => ({
            openTime: index * 3_600_000,
            closeTime: (index + 1) * 3_600_000,
            open: close,
            high: close,
            low: close,
            close,
            volume: 1
          }))
        }
      ]
    }, {})).toMatchObject({ signal: { action: "buy" } });
  });
});
