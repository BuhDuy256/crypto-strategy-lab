// Built-in simple moving-average crossover strategy and its renderable descriptor.

import type { LineAnnotation } from "./annotation.js";
import { simpleMovingAverage } from "./indicators.js";
import type { StrategyParameters } from "./parameter-schema.js";
import type {
  AnalysisContext,
  PriceBar,
  Strategy,
  StrategyDescriptor,
  StrategyResult
} from "./strategy.js";

const PRICE_SOURCES = ["open", "high", "low", "close"] as const;
type PriceSource = (typeof PRICE_SOURCES)[number];

export const MA_STRATEGY_DESCRIPTOR: StrategyDescriptor = {
  id: "moving-average",
  version: "1.0.0",
  name: "Moving average crossover",
  description: "Signals when a fast simple moving average crosses a slow average.",
  category: "trend",
  capabilities: ["long", "short", "annotations"],
  parameterSchema: {
    properties: {
      fastPeriod: {
        type: "integer",
        label: "Fast period",
        description: "Number of candles in the fast simple moving average.",
        minimum: 2,
        default: 10
      },
      slowPeriod: {
        type: "integer",
        label: "Slow period",
        description: "Number of candles in the slow simple moving average.",
        minimum: 3,
        default: 20
      },
      priceSource: {
        type: "enum",
        label: "Price source",
        description: "Candle price used by both averages.",
        values: PRICE_SOURCES,
        default: "close"
      }
    },
    required: ["fastPeriod", "slowPeriod", "priceSource"]
  },
  requiredInputs: ["price-bars"],
  implementation: { kind: "built-in", key: "moving-average" }
};

function period(parameters: StrategyParameters, field: "fastPeriod" | "slowPeriod"): number {
  const value = parameters[field];
  if (typeof value !== "number") {
    throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be a number`);
  }
  return value;
}

function isPriceSource(value: unknown): value is PriceSource {
  return typeof value === "string" && (PRICE_SOURCES as readonly string[]).includes(value);
}

function priceSource(parameters: StrategyParameters): PriceSource {
  const value = parameters.priceSource;
  if (isPriceSource(value)) {
    return value;
  }
  throw new Error("STRATEGY_PARAMETER_ENUM: field priceSource is invalid");
}

function line(
  id: string,
  label: string,
  bars: readonly PriceBar[],
  values: readonly number[],
  periodLength: number
): LineAnnotation {
  return {
    type: "line",
    id,
    label,
    points: values.map((value, index) => {
      const bar = bars[index + periodLength - 1];
      if (bar === undefined) {
        throw new Error("MA_ANNOTATION_ALIGNMENT: average has no matching candle");
      }
      return { time: bar.closeTime, value };
    })
  };
}

export class MAStrategy implements Strategy {
  readonly descriptor = MA_STRATEGY_DESCRIPTOR;

  validateParameters(parameters: StrategyParameters): void {
    if (period(parameters, "fastPeriod") >= period(parameters, "slowPeriod")) {
      throw new Error("STRATEGY_PARAMETER_RELATION: fastPeriod must be smaller than slowPeriod");
    }
  }

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    this.validateParameters(parameters);
    const fastPeriod = period(parameters, "fastPeriod");
    const slowPeriod = period(parameters, "slowPeriod");

    const source = priceSource(parameters);
    const priceBars = context.inputs.find((input) => input.kind === "price-bars");
    if (priceBars === undefined) {
      throw new Error("STRATEGY_INPUT_REQUIRED: missing input price-bars");
    }
    const values = priceBars.bars.map((bar) => bar[source]);
    const fastAverages = simpleMovingAverage(values, fastPeriod);
    const slowAverages = simpleMovingAverage(values, slowPeriod);
    const annotations = [
      line("fast-average", `Fast SMA (${fastPeriod})`, priceBars.bars, fastAverages, fastPeriod),
      line("slow-average", `Slow SMA (${slowPeriod})`, priceBars.bars, slowAverages, slowPeriod)
    ];
    const effectiveTime = priceBars.bars.at(-1)?.closeTime ?? context.evaluationTime;

    if (priceBars.bars.length < slowPeriod + 1) {
      return {
        signal: { action: "hold", effectiveTime, reason: "Moving averages are warming up" },
        annotations
      };
    }

    const currentFast = fastAverages.at(-1);
    const previousFast = fastAverages.at(-2);
    const currentSlow = slowAverages.at(-1);
    const previousSlow = slowAverages.at(-2);
    if (
      currentFast === undefined ||
      previousFast === undefined ||
      currentSlow === undefined ||
      previousSlow === undefined
    ) {
      throw new Error("MA_CROSSOVER_STATE: complete averages are missing");
    }

    if (previousFast <= previousSlow && currentFast > currentSlow) {
      return {
        signal: { action: "buy", effectiveTime, reason: "Fast SMA crossed above slow SMA" },
        annotations
      };
    }
    if (previousFast >= previousSlow && currentFast < currentSlow) {
      return {
        signal: { action: "sell", effectiveTime, reason: "Fast SMA crossed below slow SMA" },
        annotations
      };
    }
    return {
      signal: { action: "hold", effectiveTime, reason: "No moving-average crossover" },
      annotations
    };
  }
}
