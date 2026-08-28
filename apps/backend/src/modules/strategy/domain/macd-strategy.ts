import type { LineAnnotation } from "./annotation.js";
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

export const MACD_STRATEGY_DESCRIPTOR: StrategyDescriptor = {
  id: "macd",
  version: "1.0.0",
  name: "Moving Average Convergence Divergence",
  description: "Signals when the MACD line crosses its signal line.",
  category: "momentum",
  capabilities: ["long", "short", "annotations"],
  parameterSchema: {
    properties: {
      fastPeriod: {
        type: "integer",
        label: "Fast period",
        description: "Number of candles in the fast exponential moving average.",
        minimum: 2,
        default: 12
      },
      slowPeriod: {
        type: "integer",
        label: "Slow period",
        description: "Number of candles in the slow exponential moving average.",
        minimum: 3,
        default: 26
      },
      signalPeriod: {
        type: "integer",
        label: "Signal period",
        description: "Number of MACD values in the signal exponential moving average.",
        minimum: 2,
        default: 9
      },
      priceSource: {
        type: "enum",
        label: "Price source",
        description: "Candle price used by the MACD calculation.",
        values: PRICE_SOURCES,
        default: "close"
      }
    },
    required: ["fastPeriod", "slowPeriod", "signalPeriod", "priceSource"]
  },
  requiredInputs: ["price-bars"],
  implementation: { kind: "built-in", key: "macd" }
};

function integerParameter(
  parameters: StrategyParameters,
  field: "fastPeriod" | "slowPeriod" | "signalPeriod"
): number {
  const value = parameters[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be an integer`);
  }
  return value;
}

function priceSource(parameters: StrategyParameters): PriceSource {
  const value = parameters.priceSource;
  if (typeof value === "string" && (PRICE_SOURCES as readonly string[]).includes(value)) {
    return value as PriceSource;
  }
  throw new Error("STRATEGY_PARAMETER_ENUM: field priceSource is invalid");
}

function exponentialMovingAverage(
  values: readonly number[],
  period: number
): readonly (number | undefined)[] {
  const result: Array<number | undefined> = Array.from({ length: values.length });
  if (values.length < period) return result;

  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = seed;
  const multiplier = 2 / (period + 1);
  let previous = seed;
  for (let index = period; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(`MACD_VALUE: value at index ${index} must be finite`);
    }
    previous = (value - previous) * multiplier + previous;
    result[index] = previous;
  }
  return result;
}

function line(
  id: string,
  label: string,
  bars: readonly PriceBar[],
  values: readonly (number | undefined)[]
): LineAnnotation {
  return {
    type: "line",
    id,
    label,
    points: values.flatMap((value, index) => {
      const bar = bars[index];
      return value === undefined || bar === undefined ? [] : [{ time: bar.closeTime, value }];
    })
  };
}

export class MACDStrategy implements Strategy {
  readonly descriptor = MACD_STRATEGY_DESCRIPTOR;

  validateParameters(parameters: StrategyParameters): void {
    if (integerParameter(parameters, "fastPeriod") >= integerParameter(parameters, "slowPeriod")) {
      throw new Error("STRATEGY_PARAMETER_RELATION: fastPeriod must be smaller than slowPeriod");
    }
  }

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    this.validateParameters(parameters);
    const fastPeriod = integerParameter(parameters, "fastPeriod");
    const slowPeriod = integerParameter(parameters, "slowPeriod");
    const signalPeriod = integerParameter(parameters, "signalPeriod");
    const input = context.inputs.find((candidate) => candidate.kind === "price-bars");
    if (input === undefined) {
      throw new Error("STRATEGY_INPUT_REQUIRED: missing input price-bars");
    }

    const values = input.bars.map((bar) => bar[priceSource(parameters)]);
    const fast = exponentialMovingAverage(values, fastPeriod);
    const slow = exponentialMovingAverage(values, slowPeriod);
    const macd = values.map((_, index) => {
      const fastValue = fast[index];
      const slowValue = slow[index];
      return fastValue === undefined || slowValue === undefined ? undefined : fastValue - slowValue;
    });
    const firstMacdIndex = macd.findIndex((value) => value !== undefined);
    const denseMacd = firstMacdIndex < 0
      ? []
      : macd.slice(firstMacdIndex).filter((value): value is number => value !== undefined);
    const denseSignal = exponentialMovingAverage(denseMacd, signalPeriod);
    const signal = values.map<number | undefined>(() => undefined);
    if (firstMacdIndex >= 0) {
      denseSignal.forEach((value, index) => {
        signal[firstMacdIndex + index] = value;
      });
    }

    const annotations = [
      line("macd-line", "MACD", input.bars, macd),
      line("macd-signal", `Signal (${signalPeriod})`, input.bars, signal)
    ];
    const effectiveTime = input.bars.at(-1)?.closeTime ?? context.evaluationTime;
    const currentMacd = macd.at(-1);
    const previousMacd = macd.at(-2);
    const currentSignal = signal.at(-1);
    const previousSignal = signal.at(-2);
    if (
      currentMacd === undefined ||
      previousMacd === undefined ||
      currentSignal === undefined ||
      previousSignal === undefined
    ) {
      return {
        signal: { action: "hold", effectiveTime, reason: "MACD is warming up" },
        annotations
      };
    }
    if (previousMacd <= previousSignal && currentMacd > currentSignal) {
      return {
        signal: { action: "buy", effectiveTime, reason: "MACD crossed above the signal line" },
        annotations
      };
    }
    if (previousMacd >= previousSignal && currentMacd < currentSignal) {
      return {
        signal: { action: "sell", effectiveTime, reason: "MACD crossed below the signal line" },
        annotations
      };
    }
    return {
      signal: { action: "hold", effectiveTime, reason: "No MACD crossover" },
      annotations
    };
  }
}
