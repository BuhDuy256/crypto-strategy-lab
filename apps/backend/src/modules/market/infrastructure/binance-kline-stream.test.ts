// Stream-client tests run against a local fake Binance stream server.
// No test in this file reaches the real Binance service.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket, { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import type { AddressInfo } from "node:net";
import {
  BinanceKlineStreamClient,
  klineStreamName,
  normalizeKlineEvent
} from "./binance-kline-stream.js";
import type { Candle } from "../domain/candle.js";

const ONE_MINUTE = 60_000;
const OPEN_TIME = 1_700_000_000_000 - (1_700_000_000_000 % ONE_MINUTE);

function klineEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    e: "kline",
    E: OPEN_TIME + 1000,
    s: "BTCUSDT",
    k: {
      t: OPEN_TIME,
      T: OPEN_TIME + ONE_MINUTE - 1,
      s: "BTCUSDT",
      i: "1m",
      o: "100.5",
      c: "101.5",
      h: "102",
      l: "99",
      v: "12.5",
      x: false,
      ...overrides
    }
  };
}

interface FakeStreamServer {
  readonly url: string;
  readonly connections: ServerSocket[];
  readonly requestedPaths: string[];
  waitForConnection(): Promise<ServerSocket>;
  close(): Promise<void>;
}

async function startFakeStreamServer(): Promise<FakeStreamServer> {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  const connections: ServerSocket[] = [];
  const requestedPaths: string[] = [];
  const pending: ((socket: ServerSocket) => void)[] = [];

  server.on("connection", (socket, request) => {
    requestedPaths.push(request.url ?? "");
    connections.push(socket);
    pending.shift()?.(socket);
  });

  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `ws://127.0.0.1:${port}`,
    connections,
    requestedPaths,
    waitForConnection(): Promise<ServerSocket> {
      const existing = connections[0];
      if (existing !== undefined) return Promise.resolve(existing);
      return new Promise((resolve) => pending.push(resolve));
    },
    close(): Promise<void> {
      for (const socket of connections) socket.terminate();
      return new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

function waitFor(condition: () => boolean, label: string, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

describe("klineStreamName", () => {
  it("uses Binance lower-case stream notation", () => {
    expect(klineStreamName("BTCUSDT", "1m")).toBe("btcusdt@kline_1m");
    expect(klineStreamName("BTCUSDT", "4h")).toBe("btcusdt@kline_4h");
  });
});

describe("normalizeKlineEvent", () => {
  it("normalizes a Binance kline into a candle and carries the closed flag", () => {
    const open = normalizeKlineEvent(klineEvent(), "binance");
    expect(open).toStrictEqual<Candle>({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1m",
      openTime: OPEN_TIME,
      closeTime: OPEN_TIME + ONE_MINUTE - 1,
      open: 100.5,
      high: 102,
      low: 99,
      close: 101.5,
      volume: 12.5,
      closed: false,
      revision: 1
    });
    expect(normalizeKlineEvent(klineEvent({ x: true }), "binance").closed).toBe(true);
  });

  it("rejects a payload that breaks a normalized candle rule", () => {
    expect(() => normalizeKlineEvent(klineEvent({ h: "1" }), "binance")).toThrow(/CANDLE_OHLC_HIGH/);
    expect(() => normalizeKlineEvent(klineEvent({ i: "3m" }), "binance")).toThrow(/unsupported interval/);
    expect(() => normalizeKlineEvent(klineEvent({ x: "yes" }), "binance")).toThrow(/closed flag/);
    expect(() => normalizeKlineEvent({ e: "kline" }, "binance")).toThrow(/"k" object/);
  });
});

describe("BinanceKlineStreamClient", () => {
  let server: FakeStreamServer;
  let client: BinanceKlineStreamClient | undefined;

  beforeEach(async () => {
    server = await startFakeStreamServer();
  });

  afterEach(async () => {
    client?.close();
    client = undefined;
    await server.close();
    vi.restoreAllMocks();
  });

  it("requests every stream on one connection and emits normalized candles", async () => {
    const received: Candle[] = [];
    client = new BinanceKlineStreamClient({ baseUrl: server.url });
    client.onCandle((candle) => {
      received.push(candle);
    });
    await client.open([klineStreamName("BTCUSDT", "1m"), klineStreamName("BTCUSDT", "5m")]);

    expect(server.connections).toHaveLength(1);
    expect(server.requestedPaths[0]).toBe(
      "/stream?streams=btcusdt@kline_1m/btcusdt@kline_5m"
    );

    const socket = await server.waitForConnection();
    socket.send(JSON.stringify({ stream: "btcusdt@kline_1m", data: klineEvent() }));
    socket.send(JSON.stringify({ stream: "btcusdt@kline_1m", data: klineEvent({ x: true }) }));

    await waitFor(() => received.length === 2, "two candles");
    expect(received.map((candle) => candle.closed)).toStrictEqual([false, true]);
  });

  it("answers a server ping so the connection stays open past the ping interval", async () => {
    client = new BinanceKlineStreamClient({ baseUrl: server.url });
    await client.open([klineStreamName("BTCUSDT", "1m")]);
    const socket = await server.waitForConnection();

    const pongs: string[] = [];
    socket.on("pong", (data: Buffer) => pongs.push(data.toString()));
    socket.ping("keepalive-1");
    await waitFor(() => pongs.length === 1, "the first pong");
    socket.ping("keepalive-2");
    await waitFor(() => pongs.length === 2, "the second pong");

    expect(pongs).toStrictEqual(["keepalive-1", "keepalive-2"]);
    expect(client.answeredPings).toBe(2);
    // The connection survived both pings; a silent client would have been dropped.
    expect(socket.readyState).toBe(socket.OPEN);
  });

  it("ignores control replies and malformed frames instead of failing the stream", async () => {
    const received: Candle[] = [];
    client = new BinanceKlineStreamClient({ baseUrl: server.url });
    client.onCandle((candle) => {
      received.push(candle);
    });
    await client.open([klineStreamName("BTCUSDT", "1m")]);
    const socket = await server.waitForConnection();

    socket.send("{not json");
    socket.send(JSON.stringify({ result: null, id: 1 }));
    socket.send(JSON.stringify({ stream: "btcusdt@kline_1m", data: klineEvent({ h: "1" }) }));
    socket.send(JSON.stringify({ stream: "btcusdt@kline_1m", data: klineEvent({ x: true }) }));

    await waitFor(() => received.length === 1, "the one valid candle");
    expect(received[0]?.closed).toBe(true);
  });

  it("reports a closed connection to its owner", async () => {
    let closed = false;
    client = new BinanceKlineStreamClient({ baseUrl: server.url });
    client.onClose(() => {
      closed = true;
    });
    await client.open([klineStreamName("BTCUSDT", "1m")]);
    const socket = await server.waitForConnection();
    socket.close();

    await waitFor(() => closed, "the close callback");
  });

  it("pauses socket reads until asynchronous candle delivery settles", async () => {
    const pause = vi.spyOn(WebSocket.prototype, "pause");
    const resume = vi.spyOn(WebSocket.prototype, "resume");
    let release: (() => void) | undefined;
    client = new BinanceKlineStreamClient({ baseUrl: server.url });
    client.onCandle(() => new Promise((resolve) => {
      release = resolve;
    }));
    await client.open([klineStreamName("BTCUSDT", "1m")]);
    const socket = await server.waitForConnection();

    socket.send(JSON.stringify({ stream: "btcusdt@kline_1m", data: klineEvent() }));
    await waitFor(() => release !== undefined, "the blocked candle delivery");

    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
    release?.();
    await waitFor(() => resume.mock.calls.length === 1, "socket delivery to resume");
  });
});
