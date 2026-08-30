import type { LevelAnnotation } from "./annotation.js";
import { relativeStrengthIndex } from "./indicators.js";
import type { StrategyParameters } from "./parameter-schema.js";
import type { AnalysisContext, Strategy, StrategyDescriptor, StrategyResult } from "./strategy.js";

const PRICE_SOURCES = ["open", "high", "low", "close"] as const;
type PriceSource = (typeof PRICE_SOURCES)[number];

export const RSI_STRATEGY_DESCRIPTOR: StrategyDescriptor = {
  id: "rsi",
  version: "1.0.0",
  name: "Relative Strength Index",
  description: "Signals oversold (buy) and overbought (sell) conditions based on RSI.",
  category: "momentum",
  capabilities: ["long", "short", "annotations"],
  parameterSchema: {
    properties: {
      period: {
        type: "integer",
        label: "Period",
        description: "Number of candles in the RSI calculation.",
        minimum: 2,
        default: 14
      },
      buyThreshold: {
        type: "integer",
        label: "Buy threshold",
        description: "RSI value below which the asset is considered oversold.",
        minimum: 0,
        maximum: 100,
        default: 30
      },
      sellThreshold: {
        type: "integer",
        label: "Sell threshold",
        description: "RSI value above which the asset is considered overbought.",
        minimum: 0,
        maximum: 100,
        default: 70
      },
      priceSource: {
        type: "enum",
        label: "Price source",
        description: "Candle price used for calculation.",
        values: PRICE_SOURCES,
        default: "close"
      }
    },
    required: ["period", "buyThreshold", "sellThreshold", "priceSource"]
  },
  requiredInputs: ["price-bars"],
  implementation: { kind: "built-in", key: "rsi" }
};

function getNumber(parameters: StrategyParameters, field: string): number {
  const value = parameters[field];
  if (typeof value !== "number") {
    throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be a number`);
  }
  return value;
}

export class RsiStrategy implements Strategy {
  readonly descriptor = RSI_STRATEGY_DESCRIPTOR;

  validateParameters(parameters: StrategyParameters): void {
    if (getNumber(parameters, "buyThreshold") >= getNumber(parameters, "sellThreshold")) {
      throw new Error("STRATEGY_PARAMETER_RELATION: buyThreshold must be strictly smaller than sellThreshold");
    }
  }

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    this.validateParameters(parameters);
    const period = getNumber(parameters, "period");
    const buyThreshold = getNumber(parameters, "buyThreshold");
    const sellThreshold = getNumber(parameters, "sellThreshold");

    const priceSource = parameters.priceSource as PriceSource;
    const priceBars = context.inputs.find((input) => input.kind === "price-bars");
    if (priceBars === undefined) {
      throw new Error("STRATEGY_INPUT_REQUIRED: missing input price-bars");
    }

    const values = priceBars.bars.map((bar) => bar[priceSource]);
    const rsiValues = relativeStrengthIndex(values, period);
    const effectiveTime = priceBars.bars.at(-1)?.closeTime ?? context.evaluationTime;

    const buyLevel: LevelAnnotation = {
      type: "level",
      id: "rsi-buy-level",
      label: "Oversold",
      value: buyThreshold
    };
    const sellLevel: LevelAnnotation = {
      type: "level",
      id: "rsi-sell-level",
      label: "Overbought",
      value: sellThreshold
    };

    if (rsiValues.length === 0) {
      return {
        signal: { action: "hold", effectiveTime, reason: "RSI is warming up" },
        annotations: [buyLevel, sellLevel]
      };
    }

    // In a real RSI chart, RSI is a separate pane, but the requirement says "emits appropriate annotation primitives: level for RSI thresholds".
    // We can also emit the RSI line but it's on a different scale (0-100) vs price (e.g. 50k).
    // We will just emit the level annotations. Wait, if we emit level, it will draw on price chart. Is that what is expected?
    // "Each emits appropriate annotation primitives: band for Bollinger, zone for support and resistance, level for RSI thresholds."
    // If we emit the RSI line as well, it will squash the price chart. Let's not emit the RSI line, or emit it if we want?
    // Wait, let's just stick to emitting the thresholds as `level`.
    
    const currentRsi = rsiValues.at(-1)!;
    
    if (currentRsi < buyThreshold) {
      return {
        signal: { action: "buy", effectiveTime, reason: `RSI (${currentRsi.toFixed(2)}) is below ${buyThreshold}` },
        annotations: [buyLevel, sellLevel]
      };
    }
    if (currentRsi > sellThreshold) {
      return {
        signal: { action: "sell", effectiveTime, reason: `RSI (${currentRsi.toFixed(2)}) is above ${sellThreshold}` },
        annotations: [buyLevel, sellLevel]
      };
    }
    return {
      signal: { action: "hold", effectiveTime, reason: "RSI is neutral" },
      annotations: [buyLevel, sellLevel]
    };
  }
}
