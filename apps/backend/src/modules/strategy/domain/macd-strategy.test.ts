import { describe, expect, it } from "vitest";
import { createBuiltInStrategyRegistry } from "../application/built-in-strategy-registry.js";
import type { LineAnnotation } from "./annotation.js";
import type { PriceBar } from "./strategy.js";

const parameters = {
  fastPeriod: 2,
  slowPeriod: 3,
  signalPeriod: 2,
  priceSource: "close"
} as const;

function bars(closes: readonly number[]): readonly PriceBar[] {
  return closes.map((close, index) => ({
    openTime: index * 100,
    closeTime: index * 100 + 99,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1
  }));
}

function run(closes: readonly number[]) {
  const priceBars = bars(closes);
  return createBuiltInStrategyRegistry().resolve({ id: "macd", version: "1.0.0" }).run({
    evaluationTime: priceBars.at(-1)?.closeTime ?? 0,
    inputs: [{ kind: "price-bars", bars: priceBars }]
  }, parameters);
}

describe("MACDStrategy", () => {
  it("is discoverable and runnable through the built-in strategy registry", () => {
    const registry = createBuiltInStrategyRegistry();
    const descriptor = registry.list().find((item) => item.id === "macd");

    expect(descriptor).toMatchObject({
      id: "macd",
      version: "1.0.0",
      category: "momentum",
      requiredInputs: ["price-bars"],
      implementation: { kind: "built-in", key: "macd" }
    });
    expect(() => registry.resolve({ id: "macd", version: "1.0.0" })).not.toThrow();
  });

  it("declares complete default parameters for generic callers", () => {
    const descriptor = createBuiltInStrategyRegistry().resolve({ id: "macd", version: "1.0.0" }).descriptor;

    expect(descriptor.parameterSchema.properties).toMatchObject({
      fastPeriod: { type: "integer", default: 12 },
      slowPeriod: { type: "integer", default: 26 },
      signalPeriod: { type: "integer", default: 9 },
      priceSource: { type: "enum", default: "close", values: ["open", "high", "low", "close"] }
    });
  });

  it("buys and sells only on MACD signal-line crossings", () => {
    expect(run([1, 1, 1, 1, 2]).signal).toMatchObject({ action: "buy", effectiveTime: 499 });
    expect(run([2, 2, 2, 2, 1]).signal).toMatchObject({ action: "sell", effectiveTime: 499 });
    expect(run([1, 1, 1, 1]).signal.action).toBe("hold");
  });

  it("emits generic line annotations aligned to candle close times", () => {
    const result = run([1, 1, 1, 1, 2]);

    expect(result.annotations.map((annotation) => annotation.type)).toEqual(["line", "line"]);
    expect(result.annotations[0]).toMatchObject({
      id: "macd-line",
      points: [
        { time: 299, value: 0 },
        { time: 399, value: 0 },
        { time: 499 }
      ]
    });
    expect(result.annotations[1]).toMatchObject({
      id: "macd-signal",
      points: [
        { time: 399, value: 0 },
        { time: 499 }
      ]
    });
    expect((result.annotations[0] as LineAnnotation).points[2]?.value).toBeCloseTo(1 / 6);
    expect((result.annotations[1] as LineAnnotation).points[1]?.value).toBeCloseTo(1 / 9);
  });

  it("rejects a fast period that is not smaller than the slow period", () => {
    const runnable = createBuiltInStrategyRegistry().resolve({ id: "macd", version: "1.0.0" });
    expect(() => runnable.validateParameters({ ...parameters, fastPeriod: 3 })).toThrow(
      "fastPeriod must be smaller than slowPeriod"
    );
  });
});
