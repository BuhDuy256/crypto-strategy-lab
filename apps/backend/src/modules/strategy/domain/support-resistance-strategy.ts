import type { ZoneAnnotation } from "./annotation.js";
import type { StrategyParameters } from "./parameter-schema.js";
import type { AnalysisContext, PriceBar, Strategy, StrategyDescriptor, StrategyResult } from "./strategy.js";

export const SUPPORT_RESISTANCE_STRATEGY_DESCRIPTOR: StrategyDescriptor = {
  id: "support-resistance",
  version: "1.0.0",
  name: "Support and Resistance",
  description: "Signals based on price bouncing from local support and resistance zones.",
  category: "structure",
  capabilities: ["long", "short", "annotations"],
  parameterSchema: {
    properties: {
      period: {
        type: "integer",
        label: "Period",
        description: "Number of candles to look back for finding support/resistance.",
        minimum: 10,
        default: 50
      },
      proximity: {
        type: "number",
        label: "Proximity (%)",
        description: "Percentage distance from the zone to trigger a signal.",
        minimum: 0.1,
        default: 1.0
      }
    },
    required: ["period", "proximity"]
  },
  requiredInputs: ["price-bars"],
  metadata: {
    zoneDetectionAlgorithm: "rolling-extrema",
    zoneDetectionVersion: "1.0.0"
  },
  implementation: { kind: "built-in", key: "support-resistance" }
};

function getNumber(parameters: StrategyParameters, field: string): number {
  const value = parameters[field];
  if (typeof value !== "number") {
    throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be a number`);
  }
  return value;
}

export class SupportResistanceStrategy implements Strategy {
  readonly descriptor = SUPPORT_RESISTANCE_STRATEGY_DESCRIPTOR;

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    const period = getNumber(parameters, "period");
    const proximity = getNumber(parameters, "proximity") / 100.0;

    const priceBars = context.inputs.find((input) => input.kind === "price-bars");
    if (priceBars === undefined) {
      throw new Error("STRATEGY_INPUT_REQUIRED: missing input price-bars");
    }

    const bars = priceBars.bars;
    const effectiveTime = bars.at(-1)?.closeTime ?? context.evaluationTime;

    if (bars.length < period) {
      return {
        signal: { action: "hold", effectiveTime, reason: "Support/Resistance is warming up" },
        annotations: []
      };
    }

    const window = bars.slice(-period);
    let minLow = window[0]!.low;
    let maxHigh = window[0]!.high;
    for (const bar of window) {
      if (bar.low < minLow) minLow = bar.low;
      if (bar.high > maxHigh) maxHigh = bar.high;
    }

    const supportZone: ZoneAnnotation = {
      type: "zone",
      id: "support-zone",
      label: "Support",
      startTime: window[0]!.openTime,
      endTime: window.at(-1)!.closeTime,
      lower: minLow * 0.99,
      upper: minLow * 1.01
    };

    const resistanceZone: ZoneAnnotation = {
      type: "zone",
      id: "resistance-zone",
      label: "Resistance",
      startTime: window[0]!.openTime,
      endTime: window.at(-1)!.closeTime,
      lower: maxHigh * 0.99,
      upper: maxHigh * 1.01
    };

    const currentClose = bars.at(-1)!.close;
    
    // Check if price is near support
    if (currentClose <= minLow * (1 + proximity) && currentClose >= minLow) {
      return {
        signal: { action: "buy", effectiveTime, reason: "Price is near support zone" },
        annotations: [supportZone, resistanceZone]
      };
    }
    
    // Check if price is near resistance
    if (currentClose >= maxHigh * (1 - proximity) && currentClose <= maxHigh) {
      return {
        signal: { action: "sell", effectiveTime, reason: "Price is near resistance zone" },
        annotations: [supportZone, resistanceZone]
      };
    }

    return {
      signal: { action: "hold", effectiveTime, reason: "Price is between zones" },
      annotations: [supportZone, resistanceZone]
    };
  }
}
