// Market-owned live ingest use case.
//
// The whole point of this service is that the two live channels are different
// in kind, and the difference is decided in exactly one place:
//
//   kline x = false -> candle.tick   -> never persisted -> display only
//   kline x = true  -> candle.closed -> committed first, announced after
//
// Everything downstream of Market Data - datasets, backtests, revisions - only
// ever sees what the closed channel committed.

import type { MarketLiveMessage } from "@crypto-strategy-lab/api-contracts";
import type { Candle } from "../domain/candle.js";
import type { LiveCandlesRequest, MarketDataProvider } from "./market-data-provider.js";

export type LiveCandleChannel = "candle.tick" | "candle.closed";

/** The only rule that decides a live candle's channel. */
export function liveCandleChannel(candle: Candle): LiveCandleChannel {
  return candle.closed ? "candle.closed" : "candle.tick";
}

export interface ClosedCandleCommit {
  readonly candle: Candle;
  readonly ingestSequence: number;
}

export interface ClosedCandleStore {
  appendClosed(candle: Candle): Promise<ClosedCandleCommit>;
}

export interface LiveNotificationPublisher {
  commitAndPublish<T>(
    commit: () => Promise<T>,
    notification: (value: T) => MarketLiveMessage
  ): Promise<{ readonly value: T; readonly published: boolean }>;
}

export interface MarketIngestLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

export interface MarketLiveIngestOptions {
  /**
   * First notification sequence.
   *
   * The API drops a live message whose sequence is not greater than the last one
   * it saw, and asks for a fresh durable snapshot when it sees a jump. Seeding
   * from the wall clock makes a restarted ingest process look like a jump rather
   * than like a message from the past, so clients recover instead of going deaf.
   */
  readonly sequenceSeed?: number;
}

const CONTEXT = "MarketIngest";

export class MarketLiveIngestService {
  private readonly sequences = new Map<string, number>();
  private readonly watermarks = new Map<string, number>();
  private readonly ticksInFlight = new Map<string, Promise<void>>();
  private readonly sequenceSeed: number;
  private committedCount = 0;
  private attemptedTickCount = 0;
  private droppedTickCount = 0;

  constructor(
    private readonly provider: MarketDataProvider,
    private readonly store: ClosedCandleStore,
    private readonly publisher: LiveNotificationPublisher,
    private readonly logger: MarketIngestLogger,
    options: MarketLiveIngestOptions = {}
  ) {
    this.sequenceSeed = options.sequenceSeed ?? Date.now();
  }

  get committedCandles(): number {
    return this.committedCount;
  }

  get attemptedTickPublications(): number {
    return this.attemptedTickCount;
  }

  /** Ticks skipped because an older publish for the same stream was still running. */
  get droppedTicks(): number {
    return this.droppedTickCount;
  }

  /** Waits for in-flight tick publications. For tests and for a clean shutdown. */
  async settleTicks(): Promise<void> {
    await Promise.all([...this.ticksInFlight.values()]);
  }

  /** Consumes every requested stream until the caller aborts. */
  async run(streams: readonly LiveCandlesRequest[], signal: AbortSignal): Promise<void> {
    if (streams.length === 0) {
      throw new Error("MARKET_INGEST_STREAMS: at least one stream is required");
    }
    const names = streams.map((stream) => `${stream.symbol} ${stream.timeframe}`);
    this.logger.log(`Active streams: ${names.join(", ")}`, CONTEXT);
    await Promise.all(streams.map(async (stream) => this.consume(stream, signal)));
  }

  /**
   * Routes one live candle to its channel.
   *
   * Exposed so the channel split can be tested without a provider connection.
   */
  async handle(candle: Candle): Promise<void> {
    if (liveCandleChannel(candle) === "candle.tick") {
      this.publishTick(candle);
      return;
    }
    await this.commitAndAnnounce(candle);
  }

  private async consume(stream: LiveCandlesRequest, signal: AbortSignal): Promise<void> {
    const source = this.provider.subscribeLive(stream);
    const iterator = source[Symbol.asyncIterator]();
    const stop = (): void => {
      void iterator.return?.(undefined);
    };
    signal.addEventListener("abort", stop, { once: true });
    try {
      while (!signal.aborted) {
        const next = await iterator.next();
        if (next.done === true) break;
        await this.handle(next.value);
      }
    } finally {
      signal.removeEventListener("abort", stop);
      await iterator.return?.(undefined);
    }
  }

  /**
   * A forming candle is announced and forgotten. There is no commit here on
   * purpose: the tick channel has no durable side effect at all.
   *
   * This never waits, and it never queues. A tick publication that is slow -
   * which is exactly what a stopped Redis looks like, because each attempt has
   * to time out - must not delay the closed-candle commit behind it. Ticks
   * arrive about once a second per stream, so a backlog of slow publications
   * would starve the only channel that carries authoritative data. A tick is
   * also superseded by the next tick for the same stream, so dropping one while
   * an older publication is still running loses nothing a chart needs.
   */
  private publishTick(candle: Candle): void {
    const key = this.keyOf(candle);
    if (this.ticksInFlight.has(key)) {
      this.droppedTickCount += 1;
      return;
    }
    const running = this.publisher
      .commitAndPublish(
        () => Promise.resolve(candle),
        (value) => this.message(value, this.watermarks.get(key) ?? 0)
      )
      .then((result) => {
        if (!result.published) this.logger.warn(`Tick notification lost for ${key}`, CONTEXT);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : "unknown tick failure";
        this.logger.warn(`Tick notification failed for ${key}: ${reason}`, CONTEXT);
      })
      .finally(() => {
        this.ticksInFlight.delete(key);
      });
    this.ticksInFlight.set(key, running);
    this.attemptedTickCount += 1;
  }

  /**
   * A closed candle is committed first. The notification is best-effort: losing
   * it costs a chart one update, never a stored candle.
   */
  private async commitAndAnnounce(candle: Candle): Promise<void> {
    const key = this.keyOf(candle);
    let commit: ClosedCandleCommit | undefined;
    try {
      const result = await this.publisher.commitAndPublish(
        async () => {
          const stored = await this.store.appendClosed(candle);
          commit = stored;
          return stored;
        },
        (stored) => this.message(stored.candle, stored.ingestSequence)
      );
      if (!result.published) {
        this.logger.warn(
          `Closed candle committed for ${key} but its notification was not published`,
          CONTEXT
        );
      }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "unknown commit failure";
      this.logger.error(`Closed candle commit failed for ${key}: ${reason}`, CONTEXT);
      return;
    }
    if (commit === undefined) return;
    this.watermarks.set(key, commit.ingestSequence);
    this.committedCount += 1;
    this.logger.log(
      `Committed ${key} candle opened at ${commit.candle.openTime} as revision ${commit.candle.revision}`,
      CONTEXT
    );
  }

  private message(candle: Candle, revisionWatermark: number): MarketLiveMessage {
    return {
      schemaVersion: "v1",
      type: "market:live",
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      revisionWatermark,
      sequence: this.nextSequence(this.keyOf(candle)),
      candle
    };
  }

  private nextSequence(key: string): number {
    const next = (this.sequences.get(key) ?? this.sequenceSeed) + 1;
    this.sequences.set(key, next);
    return next;
  }

  private keyOf(candle: Candle | LiveCandlesRequest): string {
    return `${candle.symbol}|${candle.timeframe}`;
  }
}
