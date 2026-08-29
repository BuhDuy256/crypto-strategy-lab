// Binance Spot combined kline WebSocket adapter.
//
// One connection carries every active stream (the documented limit is 1024
// streams per connection, far above the four charts this product shows), and
// the raw payload is normalized here so no Binance shape leaves Market Data.
//
// Ping handling is the reason this file uses the `ws` client rather than the
// platform WebSocket: Binance sends a ping frame every 20 seconds and drops a
// connection that has not answered within a minute. `ws` answers automatically
// and, unlike the platform client, also reports the frame so the behaviour is
// observable in logs and in tests.

import WebSocket from "ws";
import {
  SUPPORTED_TIMEFRAMES,
  assertLiveCandle,
  type Candle,
  type Timeframe
} from "../domain/candle.js";

const BINANCE_TIMEFRAMES: ReadonlySet<string> = new Set(SUPPORTED_TIMEFRAMES);

export interface BinanceStreamLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
}

/** Stream name in Binance's own notation, e.g. `btcusdt@kline_1m`. */
export function klineStreamName(symbol: string, timeframe: Timeframe): string {
  return `${symbol.toLowerCase()}@kline_${timeframe}`;
}

function numeric(value: unknown, field: string): number {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`kline field "${field}" must be a number or numeric string`);
  }
  if (typeof value === "string" && value.trim() === "") {
    throw new Error(`kline field "${field}" must not be an empty string`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`kline field "${field}" must be finite, got ${String(value)}`);
  }
  return parsed;
}

function timestamp(value: unknown, field: string): number {
  const parsed = numeric(value, field);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`kline field "${field}" must be a non-negative safe integer`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps one Binance kline event to a normalized candle.
 *
 * The `x` flag decides the channel the candle belongs to and is carried through
 * as `closed`; this function never decides durability itself.
 */
export function normalizeKlineEvent(payload: unknown, provider: string): Candle {
  if (!isRecord(payload)) {
    throw new Error("kline event must be an object");
  }
  const kline = payload.k;
  if (!isRecord(kline)) {
    throw new Error("kline event must carry a \"k\" object");
  }
  const interval = kline.i;
  if (typeof interval !== "string" || !BINANCE_TIMEFRAMES.has(interval)) {
    throw new Error(`kline event carries unsupported interval "${String(interval)}"`);
  }
  const symbol = typeof kline.s === "string" && kline.s.trim() !== "" ? kline.s : payload.s;
  if (typeof symbol !== "string" || symbol.trim() === "") {
    throw new Error("kline event must carry a symbol");
  }
  if (typeof kline.x !== "boolean") {
    throw new Error("kline event must carry the boolean closed flag \"x\"");
  }

  const candle: Candle = {
    provider,
    symbol,
    timeframe: interval as Timeframe,
    openTime: timestamp(kline.t, "t"),
    closeTime: timestamp(kline.T, "T"),
    open: numeric(kline.o, "o"),
    high: numeric(kline.h, "h"),
    low: numeric(kline.l, "l"),
    close: numeric(kline.c, "c"),
    volume: numeric(kline.v, "v"),
    closed: kline.x,
    revision: 1
  };
  assertLiveCandle(candle);
  return candle;
}

/** Unwraps the combined-stream envelope `{ stream, data }` when it is present. */
function unwrapEnvelope(message: unknown): unknown {
  if (isRecord(message) && typeof message.stream === "string" && "data" in message) {
    return message.data;
  }
  return message;
}

export interface BinanceKlineStreamOptions {
  /** Base WebSocket origin, without a path. Tests point this at a local server. */
  readonly baseUrl?: string;
  readonly provider?: string;
  readonly logger?: BinanceStreamLogger;
}

const DEFAULT_BASE_URL = "wss://data-stream.binance.vision";
const DEFAULT_PROVIDER = "binance";

/**
 * A single combined-stream connection.
 *
 * The client only receives and normalizes. Reconnect, gap detection, and
 * provider health belong to `MKT-09` and are deliberately absent here; a closed
 * connection is reported through `onClose` so the owner decides what to do.
 */
export class BinanceKlineStreamClient {
  private socket: WebSocket | undefined;
  private readonly baseUrl: string;
  private readonly provider: string;
  private readonly logger: BinanceStreamLogger | undefined;
  private candleListener: ((candle: Candle) => void | Promise<void>) | undefined;
  private closeListener: (() => void) | undefined;
  private messageChain: Promise<void> = Promise.resolve();
  private pingCount = 0;
  private controlId = 0;

  constructor(options: BinanceKlineStreamOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.provider = options.provider ?? DEFAULT_PROVIDER;
    this.logger = options.logger;
  }

  /** Number of server pings answered so far. Evidence for the ping requirement. */
  get answeredPings(): number {
    return this.pingCount;
  }

  onCandle(listener: (candle: Candle) => void | Promise<void>): void {
    this.candleListener = listener;
  }

  onClose(listener: () => void): void {
    this.closeListener = listener;
  }

  /** Opens the connection carrying every named stream and resolves once it is open. */
  async open(streams: readonly string[]): Promise<void> {
    if (streams.length === 0) {
      throw new Error("BINANCE_STREAM_EMPTY: at least one stream name is required");
    }
    if (this.socket !== undefined) {
      throw new Error("BINANCE_STREAM_OPEN: the client is already connected");
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}/stream?streams=${streams.join("/")}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.on("ping", () => {
      // `ws` has already queued the pong frame; this handler only records it.
      this.pingCount += 1;
      this.logger?.log(`Answered Binance server ping ${this.pingCount}`, "MarketIngest");
    });
    socket.on("message", (raw: WebSocket.RawData) => {
      this.messageChain = this.messageChain
        .then(async () => this.handleMessage(raw.toString()))
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : "unknown delivery failure";
          this.logger?.warn(`Binance candle delivery failed: ${reason}`, "MarketIngest");
          socket.close();
        });
    });
    socket.on("error", (error: Error) => {
      this.logger?.warn(`Binance stream error: ${error.message}`, "MarketIngest");
    });
    socket.on("close", () => {
      this.socket = undefined;
      this.closeListener?.();
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", (error: Error) => reject(error));
    });
    this.logger?.log(`Binance stream open with ${streams.join(", ")}`, "MarketIngest");
  }

  /**
   * Adds streams to the live connection with Binance's documented SUBSCRIBE
   * control frame, so a later chart does not need a second connection.
   */
  subscribe(streams: readonly string[]): void {
    if (streams.length === 0) return;
    const socket = this.socket;
    if (socket === undefined) {
      throw new Error("BINANCE_STREAM_CLOSED: cannot subscribe before the connection is open");
    }
    this.controlId += 1;
    socket.send(JSON.stringify({ method: "SUBSCRIBE", params: [...streams], id: this.controlId }));
    this.logger?.log(`Binance stream subscribed to ${streams.join(", ")}`, "MarketIngest");
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private async handleMessage(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger?.warn("Ignored malformed Binance stream frame", "MarketIngest");
      return;
    }
    const event = unwrapEnvelope(parsed);
    // Subscription acknowledgements and other control replies carry no kline.
    if (!isRecord(event) || event.e !== "kline") {
      return;
    }
    let candle: Candle;
    try {
      candle = normalizeKlineEvent(event, this.provider);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "unknown normalization failure";
      this.logger?.warn(`Ignored invalid Binance kline: ${reason}`, "MarketIngest");
      return;
    }
    await this.candleListener?.(candle);
  }
}
