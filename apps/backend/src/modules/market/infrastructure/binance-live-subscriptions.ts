// Fans one Binance connection out to per-stream async iterables.
//
// The `MarketDataProvider` port hands every caller its own stream for one
// symbol and timeframe, but Binance documents a single connection as enough for
// up to 1024 streams. This registry keeps that promise: the first subscriber
// opens the connection, later subscribers join it with a SUBSCRIBE control
// frame, and each one reads from its own queue.

import { klineStreamName, type BinanceKlineStreamClient } from "./binance-kline-stream.js";
import type { Candle, Timeframe } from "../domain/candle.js";

/**
 * Buffer ceiling per subscriber.
 *
 * Overflow can only mean the consumer is slower than the provider. Forming
 * candles are display-only, so the oldest tick is dropped first and a closed
 * candle is never discarded to make room.
 */
const MAX_BUFFERED_CANDLES = 256;

class LiveCandleQueue implements AsyncIterable<Candle> {
  private readonly buffer: Candle[] = [];
  private pending: ((result: IteratorResult<Candle>) => void) | undefined;
  private rejectPending: ((error: unknown) => void) | undefined;
  private failure: unknown;
  private ended = false;

  constructor(private readonly onReturn: () => void) {}

  push(candle: Candle): void {
    if (this.ended) return;
    const waiting = this.pending;
    if (waiting !== undefined) {
      this.pending = undefined;
      this.rejectPending = undefined;
      waiting({ value: candle, done: false });
      return;
    }
    this.buffer.push(candle);
    if (this.buffer.length <= MAX_BUFFERED_CANDLES) return;
    const oldestTick = this.buffer.findIndex((entry) => !entry.closed);
    this.buffer.splice(oldestTick === -1 ? 0 : oldestTick, 1);
  }

  fail(error: unknown): void {
    if (this.ended) return;
    this.failure = error;
    this.finish();
  }

  end(): void {
    if (this.ended) return;
    this.finish();
  }

  private finish(): void {
    this.ended = true;
    const reject = this.rejectPending;
    const resolve = this.pending;
    this.pending = undefined;
    this.rejectPending = undefined;
    if (this.failure !== undefined && reject !== undefined) {
      reject(this.failure);
      return;
    }
    resolve?.({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<Candle> {
    return {
      next: async (): Promise<IteratorResult<Candle>> => {
        const buffered = this.buffer.shift();
        if (buffered !== undefined) return { value: buffered, done: false };
        if (this.failure !== undefined) throw this.failure;
        if (this.ended) return { value: undefined, done: true };
        return new Promise<IteratorResult<Candle>>((resolve, reject) => {
          this.pending = resolve;
          this.rejectPending = reject;
        });
      },
      return: async (): Promise<IteratorResult<Candle>> => {
        this.end();
        this.onReturn();
        return { value: undefined, done: true };
      }
    };
  }
}

export interface LiveSubscriptionKey {
  readonly symbol: string;
  readonly timeframe: Timeframe;
}

export class BinanceLiveSubscriptionRegistry {
  private client: BinanceKlineStreamClient | undefined;
  private connecting: Promise<void> | undefined;
  private readonly queues = new Map<string, Set<LiveCandleQueue>>();

  constructor(private readonly createClient: () => BinanceKlineStreamClient) {}

  subscribe(key: LiveSubscriptionKey): AsyncIterable<Candle> {
    const stream = klineStreamName(key.symbol, key.timeframe);
    const queue = new LiveCandleQueue(() => this.release(stream, queue));
    const existing = this.queues.get(stream);
    if (existing !== undefined) {
      // The connection already carries this stream; nothing to request.
      existing.add(queue);
    } else {
      this.queues.set(stream, new Set([queue]));
      this.attach(stream, queue);
    }
    return queue;
  }

  close(): void {
    this.client?.close();
    this.client = undefined;
    this.connecting = undefined;
    this.endAll();
  }

  private attach(stream: string, queue: LiveCandleQueue): void {
    if (this.client !== undefined) {
      this.client.subscribe([stream]);
      return;
    }
    if (this.connecting !== undefined) {
      // Another subscriber is still opening; join as soon as it is connected.
      void this.connecting.then(() => {
        this.client?.subscribe([stream]);
      });
      return;
    }
    const client = this.createClient();
    client.onCandle((candle) => this.dispatch(candle));
    client.onClose(() => this.handleClose());
    this.connecting = client
      .open([stream])
      .then(() => {
        this.client = client;
      })
      .catch((error: unknown) => {
        this.connecting = undefined;
        queue.fail(error);
      });
  }

  private dispatch(candle: Candle): void {
    const stream = klineStreamName(candle.symbol, candle.timeframe);
    const queues = this.queues.get(stream);
    if (queues === undefined) return;
    for (const queue of queues) queue.push(candle);
  }

  private handleClose(): void {
    this.client = undefined;
    this.connecting = undefined;
    this.endAll();
  }

  private endAll(): void {
    for (const queues of this.queues.values()) {
      for (const queue of queues) queue.end();
    }
    this.queues.clear();
  }

  private release(stream: string, queue: LiveCandleQueue): void {
    const queues = this.queues.get(stream);
    if (queues === undefined) return;
    queues.delete(queue);
    if (queues.size === 0) this.queues.delete(stream);
  }
}
