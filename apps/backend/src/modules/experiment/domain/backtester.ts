// Pure deterministic trade simulation for the accepted V1 execution model.

import type { Annotation, PriceBar, Signal } from "../../strategy/index.js";
import type { ExecutionModelConfiguration } from "./experiment-specification.js";

export const BACKTEST_ENGINE = { id: "backtester", version: "1.0.0" } as const;

export type TradeDirection = "long" | "short";
export type TradeExitReason = "signal" | "stop-loss" | "take-profit" | "final-liquidation";

export interface BacktestTrade {
  readonly direction: TradeDirection;
  readonly entryTime: number;
  readonly entryPrice: number;
  readonly exitTime: number;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly entryFee: number;
  readonly exitFee: number;
  readonly slippage: number;
  readonly profitAndLoss: number;
  readonly exitReason: TradeExitReason;
}

export interface BacktestInput {
  readonly candles: readonly PriceBar[];
  readonly signals: readonly Signal[];
  readonly annotations: readonly Annotation[];
  readonly execution: ExecutionModelConfiguration;
}

export interface BacktestOutput {
  readonly initialCapital: number;
  readonly finalEquity: number;
  readonly trades: readonly BacktestTrade[];
  readonly annotations: readonly Annotation[];
}

interface Position {
  readonly direction: TradeDirection;
  readonly entryTime: number;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly entryFee: number;
  readonly entrySlippage: number;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function fillPrice(basePrice: number, side: "buy" | "sell", rate: number): number {
  return basePrice * (side === "buy" ? 1 + rate : 1 - rate);
}

function targetDirection(action: Signal["action"]): TradeDirection | undefined {
  return action === "buy" ? "long" : action === "sell" ? "short" : undefined;
}

export class Backtester {
  run(input: BacktestInput): BacktestOutput {
    const { execution } = input;
    let equity = execution.initialCapital;
    let position: Position | undefined;
    const trades: BacktestTrade[] = [];
    const signals = new Map(input.signals.map((signal) => [signal.effectiveTime, signal]));

    const close = (basePrice: number, time: number, reason: TradeExitReason): void => {
      if (position === undefined) return;
      const side = position.direction === "long" ? "sell" : "buy";
      const exitPrice = round(fillPrice(basePrice, side, execution.slippageRate), execution.decimalPlaces);
      const exitFee = round(exitPrice * position.quantity * execution.feeRate, execution.decimalPlaces);
      const gross = (exitPrice - position.entryPrice) * position.quantity * (position.direction === "long" ? 1 : -1);
      const pnl = round(gross - position.entryFee - exitFee, execution.decimalPlaces);
      trades.push({
        direction: position.direction,
        entryTime: position.entryTime,
        entryPrice: position.entryPrice,
        exitTime: time,
        exitPrice,
        quantity: position.quantity,
        entryFee: position.entryFee,
        exitFee,
        slippage: round(position.entrySlippage + Math.abs(exitPrice - basePrice) * position.quantity, execution.decimalPlaces),
        profitAndLoss: pnl,
        exitReason: reason
      });
      equity = round(equity + pnl, execution.decimalPlaces);
      position = undefined;
    };

    const open = (direction: TradeDirection, basePrice: number, time: number): void => {
      if (!execution.allowedDirections.includes(direction)) return;
      const side = direction === "long" ? "buy" : "sell";
      const entryPrice = round(fillPrice(basePrice, side, execution.slippageRate), execution.decimalPlaces);
      const quantity = round(equity / (entryPrice * (1 + execution.feeRate)), execution.decimalPlaces);
      const entryFee = round(entryPrice * quantity * execution.feeRate, execution.decimalPlaces);
      position = {
        direction,
        entryTime: time,
        entryPrice,
        quantity,
        entryFee,
        entrySlippage: round(Math.abs(entryPrice - basePrice) * quantity, execution.decimalPlaces)
      };
    };

    for (let index = 0; index < input.candles.length; index += 1) {
      const candle = input.candles[index];
      if (candle === undefined) continue;

      // The previous close is known at this open, so execute it before observing
      // any high/low from the current candle. This preserves intrabar ordering.
      const previous = input.candles[index - 1];
      const signal = previous === undefined ? undefined : signals.get(previous.closeTime);
      const requested = signal === undefined ? undefined : targetDirection(signal.action);
      if (requested !== undefined && requested !== position?.direction) {
        if (position !== undefined) close(candle.open, candle.openTime, "signal");
        open(requested, candle.open, candle.openTime);
      }

      if (position !== undefined) {
        const stop = execution.stopLoss.enabled
          ? position.entryPrice * (position.direction === "long" ? 1 - execution.stopLoss.percentage : 1 + execution.stopLoss.percentage)
          : undefined;
        const take = execution.takeProfit.enabled
          ? position.entryPrice * (position.direction === "long" ? 1 + execution.takeProfit.percentage : 1 - execution.takeProfit.percentage)
          : undefined;
        const stopHit = stop !== undefined && (position.direction === "long" ? candle.low <= stop : candle.high >= stop);
        const takeHit = take !== undefined && (position.direction === "long" ? candle.high >= take : candle.low <= take);
        if (stopHit) close(stop as number, candle.closeTime, "stop-loss");
        else if (takeHit) close(take as number, candle.closeTime, "take-profit");
      }
    }

    const finalCandle = input.candles.at(-1);
    if (position !== undefined && finalCandle !== undefined) {
      close(finalCandle.close, finalCandle.closeTime, "final-liquidation");
    }
    return {
      initialCapital: execution.initialCapital,
      finalEquity: round(equity, execution.decimalPlaces),
      trades,
      annotations: input.annotations
    };
  }
}
