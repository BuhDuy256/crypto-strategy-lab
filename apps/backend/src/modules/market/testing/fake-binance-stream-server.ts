// Controllable stand-in for the Binance combined-stream endpoint.
//
// Reconnect and recovery only become testable when a disconnect can be caused
// on demand. Waiting for the documented 24-hour connection lifetime is not a
// test, so every disconnect path in `MKT-09` is exercised against this server.
// No test that uses it reaches the real Binance service.

import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import type { AddressInfo } from "node:net";
import { timeframeDurationMs, type Timeframe } from "../domain/candle.js";

export interface FakeKlineOptions {
  readonly symbol?: string;
  readonly timeframe?: Timeframe;
  readonly openTime: number;
  readonly closed: boolean;
  readonly close?: number;
}

/** One Binance kline event, in the wire shape the adapter normalizes. */
export function fakeKlineEvent(options: FakeKlineOptions): Record<string, unknown> {
  const symbol = options.symbol ?? "BTCUSDT";
  const timeframe = options.timeframe ?? "1m";
  const close = options.close ?? 101.5;
  return {
    e: "kline",
    E: options.openTime + 1,
    s: symbol,
    k: {
      t: options.openTime,
      T: options.openTime + timeframeDurationMs(timeframe) - 1,
      s: symbol,
      i: timeframe,
      o: "100.5",
      c: String(close),
      h: "102",
      l: "99",
      v: "12.5",
      x: options.closed
    }
  };
}

export class FakeBinanceStreamServer {
  private readonly server: WebSocketServer;
  private readonly sockets: ServerSocket[] = [];
  private readonly waiting: ((socket: ServerSocket) => void)[] = [];
  private readonly paths: string[] = [];

  private constructor(server: WebSocketServer) {
    this.server = server;
    server.on("connection", (socket, request) => {
      this.paths.push(request.url ?? "");
      this.sockets.push(socket);
      this.waiting.shift()?.(socket);
    });
  }

  static async start(): Promise<FakeBinanceStreamServer> {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    return new FakeBinanceStreamServer(server);
  }

  get url(): string {
    return `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  /** How many times a client has connected. One per connection generation. */
  get connectionCount(): number {
    return this.sockets.length;
  }

  /** Stream sets each connection asked for, in connection order. */
  get requestedPaths(): readonly string[] {
    return this.paths;
  }

  /** Resolves with connection number `index`, waiting for it when needed. */
  async connection(index = 0): Promise<ServerSocket> {
    const existing = this.sockets[index];
    if (existing !== undefined) return existing;
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  async send(event: Record<string, unknown>, connectionIndex = -1): Promise<void> {
    const socket = await this.connection(
      connectionIndex === -1 ? this.sockets.length - 1 : connectionIndex
    );
    socket.send(JSON.stringify(event));
  }

  /** Drops a connection the way a provider outage does: without a close handshake. */
  async drop(connectionIndex = -1): Promise<void> {
    const index = connectionIndex === -1 ? this.sockets.length - 1 : connectionIndex;
    const socket = await this.connection(index);
    socket.terminate();
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.terminate();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

/** Polls until `condition` holds. Keeps tests free of fixed sleeps. */
export function waitFor(
  condition: () => boolean,
  label: string,
  timeoutMs = 4000
): Promise<void> {
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
