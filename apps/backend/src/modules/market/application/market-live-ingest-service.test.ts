import { describe, expect, it } from "vitest";
import type { MarketLiveMessage } from "@crypto-strategy-lab/api-contracts";
import { CommittedLivePublisher } from "../../../platform/realtime/committed-live-publisher.js";
import { assertHistoricalCandleSeries, type Candle } from "../domain/candle.js";
import {
  MarketLiveIngestService,
  liveCandleChannel,
  type ClosedCandleCommit,
  type ClosedCandleStore,
  type MarketIngestLogger
} from "./market-live-ingest-service.js";
import type { MarketDataProvider, ProviderHealth } from "./market-data-provider.js";

const ONE_MINUTE = 60_000;
const OPEN_TIME = 1_700_000_040_000;

function candle(overrides: Partial<Candle> = {}): Candle {
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1m",
    openTime: OPEN_TIME,
    closeTime: OPEN_TIME + ONE_MINUTE - 1,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 3,
    closed: false,
    revision: 1,
    ...overrides
  };
}

/** Mirrors the repository rule that an identical candle inserts no new revision. */
class FakeClosedCandleStore implements ClosedCandleStore {
  readonly committed: Candle[] = [];
  private readonly rows = new Map<string, ClosedCandleCommit>();
  private sequence = 0;
  failNext = false;

  appendClosed(input: Candle): Promise<ClosedCandleCommit> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("database unavailable"));
    }
    if (!input.closed) {
      return Promise.reject(new Error("CANDLE_NOT_CLOSED: the store refuses a forming candle"));
    }
    const key = `${input.symbol}|${input.timeframe}|${input.openTime}`;
    const existing = this.rows.get(key);
    if (existing !== undefined && existing.candle.close === input.close) {
      return Promise.resolve(existing);
    }
    this.sequence += 1;
    const stored: ClosedCandleCommit = {
      candle: { ...input, revision: (existing?.candle.revision ?? 0) + 1 },
      ingestSequence: this.sequence
    };
    this.rows.set(key, stored);
    this.committed.push(stored.candle);
    return Promise.resolve(stored);
  }
}

class RecordingTransport {
  readonly published: MarketLiveMessage[] = [];
  readonly events: string[] = [];
  fail = false;

  publish(message: MarketLiveMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error("Redis is down"));
    this.events.push(`publish:${message.candle.closed ? "closed" : "tick"}`);
    this.published.push(message);
    return Promise.resolve();
  }
}

function silentLogger(): MarketIngestLogger & { readonly warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    log(): void {},
    warn(message: string): void {
      warnings.push(message);
    },
    error(): void {}
  };
}

function unusedProvider(): MarketDataProvider {
  return {
    fetchHistorical(): Promise<readonly Candle[]> {
      throw new Error("not used");
    },
    subscribeLive(): AsyncIterable<Candle> {
      throw new Error("not used");
    },
    getHealth(): Promise<ProviderHealth> {
      throw new Error("not used");
    }
  };
}

interface Harness {
  readonly service: MarketLiveIngestService;
  readonly store: FakeClosedCandleStore;
  readonly transport: RecordingTransport;
  readonly logger: ReturnType<typeof silentLogger>;
}

function harness(store = new FakeClosedCandleStore()): Harness {
  const transport = new RecordingTransport();
  const logger = silentLogger();
  const publisher = new CommittedLivePublisher(transport, logger);
  const service = new MarketLiveIngestService(
    unusedProvider(),
    store,
    publisher,
    logger,
    { sequenceSeed: 1000 }
  );
  return { service, store, transport, logger };
}

describe("liveCandleChannel", () => {
  it("routes a forming kline to the tick channel and a closed kline to the closed channel", () => {
    expect(liveCandleChannel(candle({ closed: false }))).toBe("candle.tick");
    expect(liveCandleChannel(candle({ closed: true }))).toBe("candle.closed");
  });
});

describe("MarketLiveIngestService", () => {
  it("commits exactly one candle for a closed kline and announces it after the commit", async () => {
    const { service, store, transport } = harness();
    store.committed.length = 0;

    const observed: string[] = [];
    const watched = new FakeClosedCandleStore();
    const watchedTransport = new RecordingTransport();
    const watchedService = new MarketLiveIngestService(
      unusedProvider(),
      {
        async appendClosed(input: Candle): Promise<ClosedCandleCommit> {
          observed.push("commit");
          return watched.appendClosed(input);
        }
      },
      new CommittedLivePublisher(
        {
          publish(message: MarketLiveMessage): Promise<void> {
            observed.push("publish");
            return watchedTransport.publish(message);
          }
        },
        silentLogger()
      ),
      silentLogger()
    );

    await watchedService.handle(candle({ closed: true }));

    expect(watched.committed).toHaveLength(1);
    expect(observed).toStrictEqual(["commit", "publish"]);
    expect(watchedTransport.published[0]?.candle.closed).toBe(true);
    expect(watchedTransport.published[0]?.symbol).toBe("BTCUSDT");
    expect(watchedTransport.published[0]?.timeframe).toBe("1m");

    await service.handle(candle({ closed: true }));
    expect(transport.published).toHaveLength(1);
  });

  it("publishes a forming kline as a tick and never commits it", async () => {
    const { service, store, transport } = harness();

    await service.handle(candle({ closed: false, close: 101 }));
    await service.settleTicks();
    await service.handle(candle({ closed: false, close: 102 }));
    await service.settleTicks();

    expect(store.committed).toStrictEqual([]);
    expect(transport.events).toStrictEqual(["publish:tick", "publish:tick"]);
    expect(transport.published.map((message) => message.candle.closed)).toStrictEqual([false, false]);
    expect(service.attemptedTickPublications).toBe(2);
    expect(service.committedCandles).toBe(0);
  });

  it("keeps a tick out of every durable path a dataset or backtest reads", async () => {
    const { service, store } = harness();
    const tick = candle({ closed: false });

    await service.handle(tick);
    await service.settleTicks();

    // Nothing was written, so no dataset resolution and no backtest input can see it.
    expect(store.committed).toStrictEqual([]);
    // And the durable write path itself rejects a forming candle, so a future
    // caller cannot smuggle one in either.
    expect(() => assertHistoricalCandleSeries([tick])).toThrow(/CANDLE_NOT_CLOSED/);
    await expect(store.appendClosed(tick)).rejects.toThrow(/CANDLE_NOT_CLOSED/);
  });

  it("keeps committing candles when the notification transport is down", async () => {
    const { service, store, transport, logger } = harness();
    transport.fail = true;

    await service.handle(candle({ closed: true }));
    await service.handle(candle({ closed: true, openTime: OPEN_TIME + ONE_MINUTE, closeTime: OPEN_TIME + 2 * ONE_MINUTE - 1 }));

    expect(store.committed).toHaveLength(2);
    expect(transport.published).toStrictEqual([]);
    expect(logger.warnings.some((line) => line.includes("was not published"))).toBe(true);
  });

  it("creates no duplicate candle when the same closed kline arrives again after a restart", async () => {
    const store = new FakeClosedCandleStore();
    const first = harness(store);
    await first.service.handle(candle({ closed: true }));

    // A restarted process replays the same closed kline it already committed.
    const second = harness(store);
    await second.service.handle(candle({ closed: true }));

    expect(store.committed).toHaveLength(1);
    expect(second.transport.published).toHaveLength(1);
    expect(second.transport.published[0]?.candle.revision).toBe(1);
  });

  it("numbers notifications so a client can order them and detect a restart", async () => {
    const { service, transport } = harness();

    await service.handle(candle({ closed: false }));
    await service.settleTicks();
    await service.handle(candle({ closed: true }));

    const sequences = transport.published.map((message) => message.sequence);
    expect(sequences).toStrictEqual([1001, 1002]);
    // The closed message carries the sequence its commit was stored at.
    expect(transport.published[1]?.revisionWatermark).toBe(1);
    // The tick before any commit claims no watermark of its own.
    expect(transport.published[0]?.revisionWatermark).toBe(0);
  });

  it("keeps slow tick failures bounded while committing later closed candles", async () => {
    // A stopped Redis does not fail instantly: every publish attempt has to time
    // out first. Before this was fixed, the sequential tick path starved the
    // closed channel and no candle was committed at all.
    const store = new FakeClosedCandleStore();
    let releaseTick: (() => void) | undefined;
    let publicationsInFlight = 0;
    let maxPublicationsInFlight = 0;
    const slowTransport = {
      publish(message: MarketLiveMessage): Promise<void> {
        publicationsInFlight += 1;
        maxPublicationsInFlight = Math.max(maxPublicationsInFlight, publicationsInFlight);
        if (message.candle.closed) {
          return new Promise((_resolve, reject) => queueMicrotask(() => {
            publicationsInFlight -= 1;
            reject(new Error("Redis is stopped"));
          }));
        }
        return new Promise((_resolve, reject) => {
          releaseTick = (): void => {
            publicationsInFlight -= 1;
            reject(new Error("Redis is stopped"));
          };
        });
      }
    };
    const service = new MarketLiveIngestService(
      unusedProvider(),
      store,
      new CommittedLivePublisher(slowTransport, silentLogger()),
      silentLogger()
    );

    // A tick whose publication never finishes, then more ticks, then a close.
    await service.handle(candle({ closed: false, close: 101 }));
    await service.handle(candle({ closed: false, close: 102 }));
    await service.handle(candle({ closed: false, close: 103 }));
    await service.handle(candle({ closed: true, close: 104 }));
    await service.handle(candle({ closed: false, openTime: OPEN_TIME + ONE_MINUTE }));
    await service.handle(candle({
      closed: true,
      openTime: OPEN_TIME + ONE_MINUTE,
      closeTime: OPEN_TIME + 2 * ONE_MINUTE - 1,
      close: 105
    }));

    expect(store.committed).toHaveLength(2);
    expect(service.committedCandles).toBe(2);
    // Only the first tick was ever attempted; the rest were superseded.
    expect(service.attemptedTickPublications).toBe(1);
    expect(service.droppedTicks).toBe(3);
    // One non-settling tick plus only the closed publication being handled now.
    expect(maxPublicationsInFlight).toBe(2);

    releaseTick?.();
    await service.settleTicks();
  });

  it("logs its active streams when it starts", async () => {
    const lines: string[] = [];
    const logger: MarketIngestLogger = {
      log(message: string): void {
        lines.push(message);
      },
      warn(): void {},
      error(): void {}
    };
    const provider: MarketDataProvider = {
      ...unusedProvider(),
      subscribeLive(): AsyncIterable<Candle> {
        return {
          async *[Symbol.asyncIterator](): AsyncGenerator<Candle> {
            // The stream ends immediately; only the startup log matters here.
          }
        };
      }
    };
    const service = new MarketLiveIngestService(
      provider,
      new FakeClosedCandleStore(),
      new CommittedLivePublisher(new RecordingTransport(), silentLogger()),
      logger
    );

    await service.run(
      [
        { symbol: "BTCUSDT", timeframe: "1m" },
        { symbol: "BTCUSDT", timeframe: "5m" }
      ],
      new AbortController().signal
    );

    expect(lines[0]).toBe("Active streams: BTCUSDT 1m, BTCUSDT 5m");
  });
});
