// Durable proof for MKT-06: a live Binance-shaped stream reaches PostgreSQL
// through the provider port, and only the closed channel leaves a trace.
//
// The stream is a local fake Binance server. No test here reaches Binance.

import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import type { MarketLiveMessage } from "@crypto-strategy-lab/api-contracts";
import { resetTestDatabase } from "../apps/backend/src/platform/test-database.js";
import { CommittedLivePublisher } from "../apps/backend/src/platform/realtime/committed-live-publisher.js";
import { PostgresCandleRepository } from "../apps/backend/src/modules/market/infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "../apps/backend/src/modules/market/infrastructure/postgres-dataset-manifest-store.js";
import { MarketDatasetService } from "../apps/backend/src/modules/market/application/market-dataset-service.js";
import { BinanceMarketDataProvider } from "../apps/backend/src/modules/market/infrastructure/binance-market-data-provider.js";
import { MarketLiveIngestService } from "../apps/backend/src/modules/market/application/market-live-ingest-service.js";

const ONE_MINUTE = 60_000;
const FIRST_OPEN = Date.UTC(2026, 7, 1, 0, 0, 0);
const SECOND_OPEN = FIRST_OPEN + ONE_MINUTE;

function klineFrame(openTime: number, closed: boolean, close: number): string {
  return JSON.stringify({
    stream: "btcusdt@kline_1m",
    data: {
      e: "kline",
      E: openTime + 1000,
      s: "BTCUSDT",
      k: {
        t: openTime,
        T: openTime + ONE_MINUTE - 1,
        s: "BTCUSDT",
        i: "1m",
        o: "100",
        c: String(close),
        h: "110",
        l: "90",
        v: "7",
        x: closed
      }
    }
  });
}

class CapturingTransport {
  readonly published: MarketLiveMessage[] = [];
  fail = false;

  publish(message: MarketLiveMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error("Redis is stopped"));
    this.published.push(message);
    return Promise.resolve();
  }
}

const silentLogger = {
  log(): void {},
  warn(): void {},
  error(): void {}
};

interface FakeBinance {
  readonly url: string;
  send(frame: string): void;
  waitForClient(): Promise<ServerSocket>;
  close(): Promise<void>;
}

async function startFakeBinance(): Promise<FakeBinance> {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  const clients: ServerSocket[] = [];
  const pending: ((socket: ServerSocket) => void)[] = [];
  server.on("connection", (socket) => {
    clients.push(socket);
    pending.shift()?.(socket);
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}`,
    send(frame: string): void {
      for (const socket of clients) socket.send(frame);
    },
    waitForClient(): Promise<ServerSocket> {
      const existing = clients[0];
      if (existing !== undefined) return Promise.resolve(existing);
      return new Promise((resolve) => pending.push(resolve));
    },
    close(): Promise<void> {
      for (const socket of clients) socket.terminate();
      return new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

function waitFor(condition: () => boolean, label: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (condition()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${label}`));
      setTimeout(poll, 20);
    };
    poll();
  });
}

interface RunningIngest {
  readonly transport: CapturingTransport;
  readonly service: MarketLiveIngestService;
  stop(): Promise<void>;
}

function startIngest(streamBaseUrl: string): RunningIngest {
  const transport = new CapturingTransport();
  const provider = new BinanceMarketDataProvider({ streamBaseUrl });
  const service = new MarketLiveIngestService(
    provider,
    candles,
    new CommittedLivePublisher(transport, silentLogger),
    silentLogger
  );
  const controller = new AbortController();
  const finished = service.run([{ symbol: "BTCUSDT", timeframe: "1m" }], controller.signal);
  return {
    transport,
    service,
    async stop(): Promise<void> {
      controller.abort();
      provider.closeLiveStreams();
      await finished;
    }
  };
}

let pool: Pool;
let candles: PostgresCandleRepository;

async function storedRows(): Promise<{ openTime: number; revision: number; closed: boolean }[]> {
  const result = await pool.query<{ open_time: string; revision: string; closed: boolean }>(
    "SELECT open_time, revision, closed FROM market.candles ORDER BY open_time, revision"
  );
  return result.rows.map((row) => ({
    openTime: Number(row.open_time),
    revision: Number(row.revision),
    closed: row.closed
  }));
}

describe("market live ingest against a fake Binance stream", () => {
  let binance: FakeBinance;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    candles = new PostgresCandleRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE market.candles RESTART IDENTITY CASCADE");
  });

  afterEach(async () => {
    await binance.close();
  });

  it("stores only closed klines and leaves no trace of a forming one", async () => {
    binance = await startFakeBinance();
    const ingest = startIngest(binance.url);
    await binance.waitForClient();

    // The database is empty before the run.
    expect(await storedRows()).toStrictEqual([]);

    binance.send(klineFrame(FIRST_OPEN, false, 101));
    binance.send(klineFrame(FIRST_OPEN, false, 102));
    await waitFor(() => ingest.service.attemptedTickPublications >= 1, "at least one tick");
    await ingest.service.settleTicks();
    // Two ticks arrived and the database is still empty.
    expect(await storedRows()).toStrictEqual([]);

    binance.send(klineFrame(FIRST_OPEN, true, 103));
    binance.send(klineFrame(SECOND_OPEN, true, 104));
    await waitFor(() => ingest.service.committedCandles === 2, "two committed candles");

    expect(await storedRows()).toStrictEqual([
      { openTime: FIRST_OPEN, revision: 1, closed: true },
      { openTime: SECOND_OPEN, revision: 1, closed: true }
    ]);

    // A dataset resolves to the two closed candles and to nothing else.
    const datasets = new MarketDatasetService(candles, new PostgresDatasetManifestStore(pool));
    const dataset = await datasets.createDataset({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1m",
      range: { startTime: FIRST_OPEN, endTime: SECOND_OPEN }
    });
    const resolved = await datasets.resolveDataset(dataset.ref);
    expect(resolved.candles.map((candle) => candle.close)).toStrictEqual([103, 104]);
    expect(resolved.candles.every((candle) => candle.closed)).toBe(true);

    const closedNotifications = ingest.transport.published.filter((message) => message.candle.closed);
    expect(closedNotifications).toHaveLength(2);
    expect(closedNotifications[0]?.symbol).toBe("BTCUSDT");
    expect(closedNotifications[0]?.timeframe).toBe("1m");
    expect(closedNotifications[0]?.revisionWatermark).toBeGreaterThan(0);

    await ingest.stop();
  });

  it("commits candles while the notification transport is unavailable", async () => {
    binance = await startFakeBinance();
    const ingest = startIngest(binance.url);
    await binance.waitForClient();
    ingest.transport.fail = true;

    binance.send(klineFrame(FIRST_OPEN, true, 105));
    await waitFor(() => ingest.service.committedCandles === 1, "the committed candle");

    expect(ingest.transport.published).toStrictEqual([]);
    expect(await storedRows()).toStrictEqual([
      { openTime: FIRST_OPEN, revision: 1, closed: true }
    ]);

    await ingest.stop();
  });

  it("creates no duplicate candle when a restarted process replays the same kline", async () => {
    binance = await startFakeBinance();
    const first = startIngest(binance.url);
    await binance.waitForClient();
    binance.send(klineFrame(FIRST_OPEN, true, 106));
    await waitFor(() => first.service.committedCandles === 1, "the first commit");
    await first.stop();
    await binance.close();

    // Restart: a new process reconnects and receives the same closed kline.
    binance = await startFakeBinance();
    const second = startIngest(binance.url);
    await binance.waitForClient();
    binance.send(klineFrame(FIRST_OPEN, true, 106));
    await waitFor(() => second.service.committedCandles === 1, "the replayed commit");

    expect(await storedRows()).toStrictEqual([
      { openTime: FIRST_OPEN, revision: 1, closed: true }
    ]);

    await second.stop();
  });
});
