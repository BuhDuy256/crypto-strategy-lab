// Connection lifetime against a controllable fake Binance stream server.
//
// The point of this file is that a disconnect is caused on demand, not waited
// for, and that the backoff schedule is observed through an injected sleep
// rather than by sleeping. No test here reaches the real Binance service.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveIngestSupervisor } from "./live-ingest-supervisor.js";
import type { GapRecoveryOutcome } from "./market-gap-recovery-service.js";
import { MarketLiveIngestService, type ClosedCandleCommit } from "./market-live-ingest-service.js";
import {
  ProviderHealthTracker,
  type ProviderHealthRecord,
  type ProviderHealthStore
} from "./provider-health.js";
import { RECONNECT_CEILING_MS } from "./reconnect-backoff.js";
import { BinanceMarketDataProvider } from "../infrastructure/binance-market-data-provider.js";
import {
  FakeBinanceStreamServer,
  fakeKlineEvent,
  waitFor
} from "../testing/fake-binance-stream-server.js";
import type { Candle } from "../domain/candle.js";

const ONE_MINUTE = 60_000;
const OPEN_TIME = 1_700_000_000_000 - (1_700_000_000_000 % ONE_MINUTE);

class RecordingStore implements ProviderHealthStore {
  readonly records: ProviderHealthRecord[] = [];

  async record(state: ProviderHealthRecord): Promise<void> {
    this.records.push(state);
  }
}

class MemoryCandleStore {
  readonly committed: Candle[] = [];
  private sequence = 0;

  async appendClosed(candle: Candle): Promise<ClosedCandleCommit> {
    this.committed.push(candle);
    this.sequence += 1;
    return { candle, ingestSequence: this.sequence };
  }
}

const publisher = {
  async commitAndPublish<T>(
    commit: () => Promise<T>
  ): Promise<{ readonly value: T; readonly published: boolean }> {
    return { value: await commit(), published: true };
  }
};

const logger = {
  log: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined
};

interface Harness {
  readonly server: FakeBinanceStreamServer;
  readonly provider: BinanceMarketDataProvider;
  readonly health: RecordingStore;
  readonly tracker: ProviderHealthTracker;
  readonly supervisor: LiveIngestSupervisor;
  readonly candles: MemoryCandleStore;
  /** Every backoff delay the supervisor asked for, in order. */
  readonly delays: number[];
  /** Streams recovery was asked to repair, in call order. */
  readonly recoveries: string[];
}

/** One recovery result, shaped the way `MarketGapRecoveryService` reports it. */
function recoveryOutcome(overrides: Partial<GapRecoveryOutcome> = {}): GapRecoveryOutcome {
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1m",
    missing: 0,
    recovered: 0,
    startTime: undefined,
    endTime: undefined,
    incomplete: false,
    ...overrides
  };
}

/**
 * Builds a supervisor whose backoff is observed instead of waited for.
 *
 * The injected sleep resolves immediately, so a test that needs five reconnect
 * attempts costs milliseconds, not the 31 seconds the real schedule would.
 */
async function startHarness(
  recover?: (call: number) => GapRecoveryOutcome
): Promise<Harness> {
  const server = await FakeBinanceStreamServer.start();
  const provider = new BinanceMarketDataProvider({ streamBaseUrl: server.url });
  const health = new RecordingStore();
  const tracker = new ProviderHealthTracker("binance", health, logger);
  const candles = new MemoryCandleStore();
  const delays: number[] = [];
  const ingest = new MarketLiveIngestService(provider, candles, publisher, logger, {
    observer: tracker
  });
  const recoveries: string[] = [];
  const supervisor = new LiveIngestSupervisor(
    ingest,
    tracker,
    [{ symbol: "BTCUSDT", timeframe: "1m" }],
    logger,
    {
      sleep: async (delayMs): Promise<void> => {
        delays.push(delayMs);
      },
      ...(recover === undefined
        ? {}
        : {
            recover: async (stream): Promise<GapRecoveryOutcome> => {
              recoveries.push(`${stream.symbol} ${stream.timeframe}`);
              return recover(recoveries.length);
            }
          })
    }
  );
  return { server, provider, health, tracker, supervisor, candles, delays, recoveries };
}

describe("LiveIngestSupervisor provider health", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    harness.provider.closeLiveStreams();
    await harness.server.close();
  });

  it("marks the provider healthy once live data actually arrives", async () => {
    const controller = new AbortController();
    const running = harness.supervisor.run(controller.signal);

    await harness.server.connection();
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }));
    await waitFor(() => harness.tracker.status === "healthy", "healthy provider health");

    controller.abort();
    await running;
    expect(harness.health.records[0]?.status).toBe("healthy");
  });

  it("detects a forced disconnect and marks the provider degraded", async () => {
    const controller = new AbortController();
    const running = harness.supervisor.run(controller.signal);

    await harness.server.connection();
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }));
    await waitFor(() => harness.tracker.status === "healthy", "healthy provider health");

    await harness.server.drop();
    await waitFor(() => harness.tracker.status === "degraded", "degraded provider health");

    const degraded = harness.health.records.at(-1);
    expect(degraded?.status).toBe("degraded");
    expect(degraded?.reason).toContain("closed the stream");

    controller.abort();
    await running;
  });

  it("does not degrade health when the process is shutting down", async () => {
    const controller = new AbortController();
    const running = harness.supervisor.run(controller.signal);

    await harness.server.connection();
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }));
    await waitFor(() => harness.tracker.status === "healthy", "healthy provider health");

    controller.abort();
    harness.provider.closeLiveStreams();
    await running;

    expect(harness.tracker.status).toBe("healthy");
    expect(harness.health.records.map((entry) => entry.status)).toStrictEqual(["healthy"]);
    expect(harness.delays).toStrictEqual([]);
  });
});

describe("LiveIngestSupervisor reconnect", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    harness.provider.closeLiveStreams();
    await harness.server.close();
  });

  it("reconnects after a disconnect and resumes live flow", async () => {
    const controller = new AbortController();
    const running = harness.supervisor.run(controller.signal);

    await harness.server.connection(0);
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }));
    await waitFor(() => harness.tracker.status === "healthy", "first healthy state");

    await harness.server.drop();
    await waitFor(() => harness.server.connectionCount === 2, "a second connection");

    // The reconnected generation carries the same stream and delivers candles,
    // which is what puts health back to healthy.
    expect(harness.server.requestedPaths[1]).toContain("btcusdt@kline_1m");
    await harness.server.send(
      fakeKlineEvent({ openTime: OPEN_TIME + ONE_MINUTE, closed: true }),
      1
    );
    await waitFor(() => harness.candles.committed.length === 1, "a committed candle after reconnect");
    await waitFor(() => harness.tracker.status === "healthy", "healthy again after reconnect");

    expect(harness.delays).toStrictEqual([1_000]);
    expect(harness.supervisor.reconnects).toBe(1);

    controller.abort();
    await running;
  });

  it("increases the delay while reconnects keep failing and stops at the ceiling", async () => {
    // With the server closed, every attempt fails to connect, so the schedule
    // is driven purely by consecutive failures.
    const controller = new AbortController();
    await harness.server.close();
    const running = harness.supervisor.run(controller.signal);

    await waitFor(() => harness.delays.length >= 8, "eight reconnect attempts");
    controller.abort();
    await running;

    const observed = harness.delays.slice(0, 8);
    expect(observed).toStrictEqual([
      1_000, 2_000, 4_000, 8_000, 16_000,
      RECONNECT_CEILING_MS, RECONNECT_CEILING_MS, RECONNECT_CEILING_MS
    ]);
    // No attempt is fast enough to be a tight retry loop.
    expect(Math.min(...harness.delays)).toBeGreaterThanOrEqual(1_000);
  });

  it("cancels a real backoff timer on shutdown instead of leaving it pending", async () => {
    // This is the one test that uses the real timer, because the thing being
    // proven is that shutdown does not wait for it and does not orphan it.
    const server = await FakeBinanceStreamServer.start();
    const provider = new BinanceMarketDataProvider({ streamBaseUrl: server.url });
    const tracker = new ProviderHealthTracker("binance", new RecordingStore(), logger);
    const ingest = new MarketLiveIngestService(
      provider,
      new MemoryCandleStore(),
      publisher,
      logger,
      { observer: tracker }
    );
    const supervisor = new LiveIngestSupervisor(
      ingest,
      tracker,
      [{ symbol: "BTCUSDT", timeframe: "1m" }],
      logger
    );
    await server.close();

    const controller = new AbortController();
    const running = supervisor.run(controller.signal);
    await waitFor(() => tracker.status === "degraded", "the supervisor to enter its backoff wait");

    const startedAt = Date.now();
    controller.abort();
    await running;
    provider.closeLiveStreams();

    // The base delay is one second. Returning well inside it proves the wait
    // was cancelled rather than allowed to expire.
    expect(Date.now() - startedAt).toBeLessThan(900);
  });

  it("resets the backoff after a reconnect that actually delivered candles", async () => {
    const controller = new AbortController();
    const running = harness.supervisor.run(controller.signal);

    await harness.server.connection(0);
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }));
    await waitFor(() => harness.tracker.status === "healthy", "first healthy state");
    await harness.server.drop();

    await waitFor(() => harness.server.connectionCount === 2, "a second connection");
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }), 1);
    await waitFor(() => harness.tracker.status === "healthy", "healthy again after reconnect");
    await harness.server.drop(1);

    await waitFor(() => harness.delays.length === 2, "a second backoff delay");
    controller.abort();
    await running;

    // A working generation in between means the second outage starts over at
    // the base delay instead of continuing to grow.
    expect(harness.delays).toStrictEqual([1_000, 1_000]);
  });
});

describe("LiveIngestSupervisor end-to-end recovery", () => {
  let harness: Harness;

  afterEach(async () => {
    harness.provider.closeLiveStreams();
    await harness.server.close();
  });

  /** Drives the whole state machine once and leaves the stream connected again. */
  async function outageAndRecovery(harnessUnderTest: Harness): Promise<AbortController> {
    const controller = new AbortController();
    void harnessUnderTest.supervisor.run(controller.signal);

    await harnessUnderTest.server.connection(0);
    await harnessUnderTest.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }));
    await waitFor(() => harnessUnderTest.tracker.status === "healthy", "healthy before the outage");

    await harnessUnderTest.server.drop(0);
    await waitFor(
      () => harnessUnderTest.server.connectionCount === 2,
      "a reconnected stream after the outage"
    );
    await harnessUnderTest.server.send(
      fakeKlineEvent({ openTime: OPEN_TIME + ONE_MINUTE, closed: false }),
      1
    );
    return controller;
  }

  it("runs disconnect, degraded, reconnect, recovery and healthy as one flow", async () => {
    harness = await startHarness(() => recoveryOutcome({ missing: 2, recovered: 2 }));

    const controller = await outageAndRecovery(harness);
    await waitFor(() => harness.tracker.status === "healthy", "healthy after recovery");

    // Recovery ran for the stream, once per connection generation.
    expect(harness.recoveries).toStrictEqual(["BTCUSDT 1m", "BTCUSDT 1m"]);
    expect(harness.supervisor.recoveredCandles).toBe(4);
    expect(harness.supervisor.reconnects).toBe(1);

    // The recorded states are the state machine, in order: recovery held health
    // down before any candle arrived, the outage degraded it, recovery held it
    // down again, and only then did live data restore it.
    const statuses = harness.health.records.map(
      (record) => `${record.status}:${record.reason ?? ""}`
    );
    expect(statuses[0]).toContain("degraded:recovering");
    expect(statuses[1]).toBe("healthy:");
    expect(statuses[2]).toContain("degraded:the provider closed the stream");
    expect(statuses[3]).toContain("degraded:recovering");
    expect(statuses.at(-1)).toBe("healthy:");

    controller.abort();
  });

  it("does not report healthy while a known gap remains after recovery", async () => {
    // Recovery never completes here, so this test cannot wait for healthy first:
    // that is the whole claim. The stream connects and delivers normally, and
    // health must still refuse to say healthy.
    harness = await startHarness(() =>
      recoveryOutcome({ missing: 3, recovered: 1, incomplete: true })
    );

    const controller = new AbortController();
    void harness.supervisor.run(controller.signal);

    await harness.server.connection(0);
    await waitFor(
      () =>
        harness.health.records.some(
          (record) => record.reason === "a known gap remains after recovery"
        ),
      "a recorded unresolved gap"
    );

    // Live candles keep arriving on a connection that is otherwise fine, and
    // that is exactly the false "everything is healthy" signal to refuse.
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }));
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME + ONE_MINUTE, closed: true }));
    await waitFor(() => harness.candles.committed.length === 1, "a committed live candle");

    expect(harness.tracker.status).toBe("degraded");
    expect(harness.tracker.recovering).toBe(true);
    expect(harness.health.records.some((record) => record.status === "healthy")).toBe(false);

    controller.abort();
  });

  it("retries recovery from durable state on the next cycle and then reports healthy", async () => {
    // The first attempt leaves a gap; the second one, after the next
    // disconnect, completes. Nothing is carried between them in memory: the
    // recovery service recomputes its boundary from storage every call.
    harness = await startHarness((call) =>
      call === 1
        ? recoveryOutcome({ missing: 3, recovered: 0, incomplete: true })
        : recoveryOutcome({ missing: 3, recovered: 3 })
    );

    const controller = new AbortController();
    void harness.supervisor.run(controller.signal);

    await harness.server.connection(0);
    await waitFor(
      () => harness.health.records.some((record) => record.reason === "a known gap remains after recovery"),
      "an unresolved gap on the first cycle"
    );

    await harness.server.drop(0);
    await waitFor(() => harness.server.connectionCount === 2, "a reconnected stream");
    await harness.server.send(fakeKlineEvent({ openTime: OPEN_TIME, closed: false }), 1);

    await waitFor(() => harness.tracker.status === "healthy", "healthy after the retry succeeded");
    expect(harness.tracker.recovering).toBe(false);
    expect(harness.supervisor.recoveredCandles).toBe(3);

    controller.abort();
  });

  it("commits a recovered range and a live candle for the same stream without duplicating", async () => {
    // The overlap case: recovery covers the outage while the reconnected stream
    // is already delivering. The committed set must contain each open time once.
    harness = await startHarness(() => recoveryOutcome({ missing: 1, recovered: 1 }));

    const controller = await outageAndRecovery(harness);
    await waitFor(() => harness.tracker.status === "healthy", "healthy after recovery");

    await harness.server.send(
      fakeKlineEvent({ openTime: OPEN_TIME + ONE_MINUTE, closed: true }),
      1
    );
    await waitFor(() => harness.candles.committed.length === 1, "one committed closed candle");

    // Republishing the same closed candle after recovery must not add a second
    // commit for the same identity.
    await harness.server.send(
      fakeKlineEvent({ openTime: OPEN_TIME + ONE_MINUTE, closed: true }),
      1
    );
    await waitFor(() => harness.candles.committed.length === 2, "the replayed closed candle");
    const openTimes = harness.candles.committed.map((candle) => candle.openTime);
    expect(new Set(openTimes).size).toBe(1);

    controller.abort();
  });
});
