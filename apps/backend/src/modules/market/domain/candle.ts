// Provider-neutral market candle and its validation rules.
// The contract is framework-free so every provider adapter and downstream module
// sees the same time, price, identity, and revision semantics.

export const SUPPORTED_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d"
] as const;

export type Timeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

const TIMEFRAME_DURATION_MS: Readonly<Record<Timeframe, number>> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "1d": 86_400_000
};

export interface Candle {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closed: boolean;
  readonly revision: number;
}

export function timeframeDurationMs(timeframe: Timeframe): number {
  return TIMEFRAME_DURATION_MS[timeframe];
}

/** Stable logical identity used for deduplication; revision is intentionally excluded. */
export function candleIdentity(candle: Candle): string {
  return `${candle.provider}|${candle.symbol}|${candle.timeframe}|${candle.openTime}`;
}

function fail(rule: string, message: string): never {
  throw new Error(`${rule}: ${message}`);
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    fail("CANDLE_PRICE_FINITE", `${field} must be finite, got ${String(value)}`);
  }
}

function assertCandleShape(candle: Candle, requireClosed: boolean): void {
  const duration = timeframeDurationMs(candle.timeframe);
  if (!Number.isInteger(candle.openTime) || candle.openTime % duration !== 0) {
    fail(
      "CANDLE_OPEN_TIME_ALIGNMENT",
      `openTime ${candle.openTime} is not aligned to timeframe ${candle.timeframe}`
    );
  }
  if (!Number.isInteger(candle.closeTime) || candle.closeTime !== candle.openTime + duration - 1) {
    fail(
      "CANDLE_CLOSE_TIME_ALIGNMENT",
      `closeTime ${candle.closeTime} does not close timeframe ${candle.timeframe} opened at ${candle.openTime}`
    );
  }

  const prices = [
    ["open", candle.open],
    ["high", candle.high],
    ["low", candle.low],
    ["close", candle.close]
  ] as const;
  for (const [field, value] of prices) {
    assertFinite(value, field);
    if (value <= 0) {
      fail("CANDLE_PRICE_POSITIVE", `${field} must be greater than zero, got ${value}`);
    }
  }

  if (candle.high < Math.max(candle.open, candle.low, candle.close)) {
    fail("CANDLE_OHLC_HIGH", `high ${candle.high} is below another OHLC value`);
  }
  if (candle.low > Math.min(candle.open, candle.high, candle.close)) {
    fail("CANDLE_OHLC_LOW", `low ${candle.low} is above another OHLC value`);
  }
  if (!Number.isFinite(candle.volume) || candle.volume < 0) {
    fail("CANDLE_VOLUME_NON_NEGATIVE", `volume must be finite and non-negative, got ${candle.volume}`);
  }
  if (requireClosed && !candle.closed) {
    fail("CANDLE_NOT_CLOSED", "historical series may contain only closed candles");
  }
  if (!Number.isSafeInteger(candle.revision) || candle.revision < 1) {
    fail("CANDLE_REVISION", `revision must be a positive safe integer, got ${candle.revision}`);
  }
}

/**
 * Validates one normalized live candle at the provider seam.
 *
 * A live candle may still be forming, so the closed flag is reported rather than
 * required. Every other rule - alignment, OHLC order, volume, revision - is the
 * same rule the historical path applies.
 */
export function assertLiveCandle(candle: Candle): void {
  assertCandleShape(candle, false);
}

/** Validates normalized historical output at the provider seam. */
export function assertHistoricalCandleSeries(candles: readonly Candle[]): void {
  let previousOpenTime: number | undefined;
  let previousIdentity: string | undefined;

  for (const candle of candles) {
    assertCandleShape(candle, true);
    const identity = candleIdentity(candle);
    if (
      previousOpenTime !== undefined &&
      (candle.openTime <= previousOpenTime || identity === previousIdentity)
    ) {
      fail("CANDLE_SERIES_ORDER", "candles must have unique identities in ascending open-time order");
    }
    previousOpenTime = candle.openTime;
    previousIdentity = identity;
  }
}
