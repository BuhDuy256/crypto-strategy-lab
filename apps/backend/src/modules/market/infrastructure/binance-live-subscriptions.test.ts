// Subscription registry tests use a controllable stream client so buffer and
// connection-failure behavior stay deterministic without a network server.

import { describe, expect, it } from "vitest";
import type { Candle } from "../domain/candle.js";
import type { BinanceKlineStreamClient } from "./binance-kline-stream.js";
import { BinanceLiveSubscriptionRegistry } from "./binance-live-subscriptions.js";

const ONE_MINUTE = 60_000;
const OPEN_TIME = 1_700_000_040_000;

function closedCandle(index: number): Candle {
  const openTime = OPEN_TIME + index * ONE_MINUTE;
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1m",
    openTime,
    closeTime: openTime + ONE_MINUTE - 1,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 3,
    closed: true,
    revision: 1
  };
}

class ControlledStreamClient {
  private candleListener: ((candle: Candle) => void | Promise<void>) | undefined;
  emittedCount = 0;

  constructor(private readonly openFailure?: Error) {}

  onCandle(listener: (candle: Candle) => void | Promise<void>): void {
    this.candleListener = listener;
  }

  onClose(): void {}

  open(): Promise<void> {
    return this.openFailure === undefined
      ? Promise.resolve()
      : Promise.reject(this.openFailure);
  }

  subscribe(): void {}

  close(): void {}

  emit(candle: Candle): Promise<void> {
    this.emittedCount += 1;
    return Promise.resolve(this.candleListener?.(candle));
  }
}

function asStreamClient(client: ControlledStreamClient): BinanceKlineStreamClient {
  return client as unknown as BinanceKlineStreamClient;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 500): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("test operation timed out")), timeoutMs);
    })
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
}

async function readCandles(source: AsyncIterable<Candle>, count: number): Promise<Candle[]> {
  const iterator = source[Symbol.asyncIterator]();
  const candles: Candle[] = [];
  while (candles.length < count) {
    const next = await iterator.next();
    if (next.done === true) break;
    candles.push(next.value);
  }
  return candles;
}

async function waitForEmits(client: ControlledStreamClient, count: number): Promise<void> {
  for (let attempt = 0; attempt < count * 8; attempt += 1) {
    if (client.emittedCount === count) return;
    await Promise.resolve();
  }
  throw new Error(`only ${client.emittedCount} of ${count} deliveries started`);
}

describe("BinanceLiveSubscriptionRegistry", () => {
  it("backpressures a full closed-candle buffer without dropping a candle", async () => {
    const client = new ControlledStreamClient();
    const registry = new BinanceLiveSubscriptionRegistry(() => asStreamClient(client));
    const source = registry.subscribe({ symbol: "BTCUSDT", timeframe: "1m" });
    await Promise.resolve();

    let delivery = Promise.resolve();
    for (let index = 0; index < 257; index += 1) {
      delivery = delivery.then(async () => client.emit(closedCandle(index)));
    }
    await waitForEmits(client, 257);

    try {
      const received = await withTimeout(Promise.all([delivery, readCandles(source, 257)]));
      expect(received[1].map((candle) => candle.openTime)).toStrictEqual(
        Array.from({ length: 257 }, (_value, index) => OPEN_TIME + index * ONE_MINUTE)
      );
    } finally {
      registry.close();
    }
  });

  it("fails every subscriber waiting on the same initial connection", async () => {
    const client = new ControlledStreamClient(new Error("Binance unavailable"));
    const registry = new BinanceLiveSubscriptionRegistry(() => asStreamClient(client));
    const first = registry.subscribe({ symbol: "BTCUSDT", timeframe: "1m" });
    const second = registry.subscribe({ symbol: "BTCUSDT", timeframe: "5m" });
    const resultOf = async (source: AsyncIterable<Candle>): Promise<string> => {
      try {
        await source[Symbol.asyncIterator]().next();
        return "resolved";
      } catch (error: unknown) {
        return error instanceof Error ? error.message : "unknown error";
      }
    };

    try {
      await expect(withTimeout(Promise.all([resultOf(first), resultOf(second)]))).resolves.toEqual([
        "Binance unavailable",
        "Binance unavailable"
      ]);
    } finally {
      registry.close();
    }
  });
});
