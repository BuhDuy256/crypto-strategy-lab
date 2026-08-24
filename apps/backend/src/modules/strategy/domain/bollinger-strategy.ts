import type { BandAnnotation } from "./annotation.js";
import { bollingerBands } from "./indicators.js";
import type { StrategyParameters } from "./parameter-schema.js";
import type { AnalysisContext, PriceBar, Strategy, StrategyDescriptor, StrategyResult } from "./strategy.js";

const PRICE_SOURCES = ["open", "high", "low", "close"] as const;
type PriceSource = (typeof PRICE_SOURCES)[number];

export const BOLLINGER_STRATEGY_DESCRIPTOR: StrategyDescriptor = {
  id: "bollinger-bands",
  version: "1.0.0",
  name: "Bollinger Bands",
  description: "Signals based on price breaking out of the Bollinger Bands.",
  category: "volatility",
  capabilities: ["long", "short", "annotations"],
  parameterSchema: {
    properties: {
      period: {
        type: "integer",
        label: "Period",
        description: "Number of candles in the moving average.",
        minimum: 2,
        default: 20
      },
      deviation: {
        type: "number",
        label: "Deviation",
        description: "Number of standard deviations for the bands.",
        minimum: 0.1,
        default: 2.0
      },
      priceSource: {
        type: "enum",
        label: "Price source",
        description: "Candle price used for calculation.",
        values: PRICE_SOURCES,
        default: "close"
      }
    },
    required: ["period", "deviation", "priceSource"]
  },
  requiredInputs: ["price-bars"],
  implementation: { kind: "built-in", key: "bollinger-bands" }
};

function getNumber(parameters: StrategyParameters, field: string): number {
  const value = parameters[field];
  if (typeof value !== "number") {
    throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be a number`);
  }
  return value;
}

export class BollingerBandsStrategy implements Strategy {
  readonly descriptor = BOLLINGER_STRATEGY_DESCRIPTOR;

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    const period = getNumber(parameters, "period");
    const deviation = getNumber(parameters, "deviation");

    const priceSource = parameters.priceSource as PriceSource;
    const priceBars = context.inputs.find((input) => input.kind === "price-bars");
    if (priceBars === undefined) {
      throw new Error("STRATEGY_INPUT_REQUIRED: missing input price-bars");
    }

    const values = priceBars.bars.map((bar) => bar[priceSource]);
    const { upper, lower } = bollingerBands(values, period, deviation);
    const effectiveTime = priceBars.bars.at(-1)?.closeTime ?? context.evaluationTime;

    if (upper.length === 0 || lower.length === 0) {
      return {
        signal: { action: "hold", effectiveTime, reason: "Bollinger Bands are warming up" },
        annotations: []
      };
    }

    const bandAnnotation: BandAnnotation = {
      type: "band",
      id: "bollinger-bands",
      label: `Bollinger (${period}, ${deviation})`,
      upper: upper.map((value, index) => ({ time: priceBars.bars[index + period - 1]!.closeTime, value })),
      lower: lower.map((value, index) => ({ time: priceBars.bars[index + period - 1]!.closeTime, value }))
    };

    const currentPrice = values.at(-1)!;
    const currentUpper = upper.at(-1)!;
    const currentLower = lower.at(-1)!;

    if (currentPrice < currentLower) {
      return {
        signal: { action: "buy", effectiveTime, reason: "Price is below lower band" },
        annotations: [bandAnnotation]
      };
    }
    if (currentPrice > currentUpper) {
      return {
        signal: { action: "sell", effectiveTime, reason: "Price is above upper band" },
        annotations: [bandAnnotation]
      };
    }
    return {
      signal: { action: "hold", effectiveTime, reason: "Price is inside the bands" },
      annotations: [bandAnnotation]
    };
  }
}
