// @vitest-environment jsdom
// Public-page tests for real candle loading and independent chart state.

import type { ApiCandle, ApiTimeframe } from "@crypto-strategy-lab/api-contracts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimePage } from "./RealtimePage.js";

const { subscribe, connection } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  connection: {
    state: "connected" as "connected" | "disconnected",
    listeners: new Set<(state: "connected" | "disconnected") => void>()
  }
}));
vi.mock("../api/market-realtime-client.js", () => ({
  getMarketRealtimeClient: () => ({
    subscribe,
    get connectionState() {
      return connection.state;
    },
    onConnectionChange: (listener: (state: "connected" | "disconnected") => void) => {
      connection.listeners.add(listener);
      return () => connection.listeners.delete(listener);
    }
  })
}));

vi.mock("../components/CandlestickChart.js", () => ({
  CandlestickChart: ({ candles }: { readonly candles: readonly ApiCandle[] }) => (
    <div>Rendered candles: {candles[0]?.timeframe ?? "none"}</div>
  )
}));

const OPEN_TIME = Date.UTC(2026, 0, 1);

function candle(timeframe: ApiTimeframe): ApiCandle {
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe,
    openTime: OPEN_TIME,
    closeTime: OPEN_TIME + 59_999,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 12,
    closed: true,
    revision: 1
  };
}

beforeEach(() => {
  connection.state = "connected";
  subscribe.mockImplementation((request, handlers) => {
    handlers.onSnapshot({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1,
      candles: [candle(request.timeframe)]
    });
    return () => undefined;
  });
});

afterEach(() => {
  cleanup();
  connection.listeners.clear();
  vi.clearAllMocks();
});

describe("RealtimePage charts", () => {
  it("loads four distinct chart identities and timeframes through WebSocket snapshots", async () => {
    render(<RealtimePage />);

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));
    expect(subscribe.mock.calls.map(([request]) => request.timeframe)).toEqual([
      "5m",
      "15m",
      "1h",
      "4h"
    ]);
    expect(screen.getAllByText(/Rendered candles:/).map((node) => node.textContent)).toEqual([
      "Rendered candles: 5m",
      "Rendered candles: 15m",
      "Rendered candles: 1h",
      "Rendered candles: 4h"
    ]);
    for (const id of ["chart-1", "chart-2", "chart-3", "chart-4"]) {
      expect(screen.getByText(id)).not.toBeNull();
    }
  });

  it("reloads only the chart whose timeframe changes", async () => {
    render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));

    fireEvent.change(screen.getByRole("combobox", { name: "Timeframe for chart-1" }), {
      target: { value: "1h" }
    });

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(5));
    expect(subscribe.mock.calls[4]?.[0].timeframe).toBe("1h");
    expect(
      (screen.getByRole("combobox", { name: "Timeframe for chart-2" }) as HTMLSelectElement)
        .value
    ).toBe("15m");
    expect(
      (screen.getByRole("combobox", { name: "Timeframe for chart-3" }) as HTMLSelectElement)
        .value
    ).toBe("1h");
    expect(
      (screen.getByRole("combobox", { name: "Timeframe for chart-4" }) as HTMLSelectElement)
        .value
    ).toBe("4h");

    const secondChart = screen.getByText("chart-2").closest("[data-chart-id]");
    expect(secondChart).not.toBeNull();
    expect(within(secondChart as HTMLElement).getByText("Rendered candles: 15m")).not.toBeNull();
  });
});

function renderedChartIds(): readonly string[] {
  return [...document.querySelectorAll("[data-chart-id]")]
    .map((element) => element.getAttribute("data-chart-id") ?? "");
}

describe("RealtimePage chart identity", () => {
  it("subscribes each chart under its own stable identifier, once", async () => {
    render(<RealtimePage />);

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));
    const identifiers = subscribe.mock.calls.map(([request]) => request.subscriptionId);
    expect(identifiers).toEqual(["chart-1", "chart-2", "chart-3", "chart-4"]);
    // Four calls and four distinct identifiers is one subscription per chart.
    expect(new Set(identifiers).size).toBe(4);
    // The identifier a chart subscribes with is the identity it renders under,
    // so there is one identity scheme rather than two.
    expect(renderedChartIds()).toEqual(identifiers);
  });

  it("keeps every identifier stable across a rerender without resubscribing", async () => {
    const view = render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));
    const before = renderedChartIds();

    view.rerender(<RealtimePage />);

    expect(subscribe).toHaveBeenCalledTimes(4);
    expect(renderedChartIds()).toEqual(before);
  });

  it("keeps the other identifiers stable when one chart changes timeframe", async () => {
    render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));

    fireEvent.change(screen.getByRole("combobox", { name: "Timeframe for chart-1" }), {
      target: { value: "1h" }
    });

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(5));
    expect(subscribe.mock.calls[4]?.[0].subscriptionId).toBe("chart-1");
    expect(renderedChartIds()).toEqual(["chart-1", "chart-2", "chart-3", "chart-4"]);
  });
});

type ChartHandlers = Parameters<typeof subscribe>[1];

/** Captures the handlers each chart was subscribed with, keyed by identifier. */
function captureHandlersPerChart(): Map<string, ChartHandlers> {
  const captured = new Map<string, ChartHandlers>();
  subscribe.mockImplementation((request, handlers: ChartHandlers) => {
    captured.set(request.subscriptionId, handlers);
    handlers.onSnapshot({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1,
      candles: [candle(request.timeframe)]
    });
    return () => undefined;
  });
  return captured;
}

function widget(chartId: string): HTMLElement {
  const element = document.querySelector(`[data-chart-id="${chartId}"]`);
  if (element === null) throw new Error(`chart ${chartId} is not rendered`);
  return element as HTMLElement;
}

const liveCandle = (timeframe: ApiTimeframe, openTime: number, closed: boolean) => ({
  provider: "binance", symbol: "BTCUSDT", timeframe,
  openTime, closeTime: openTime + 1, open: 1, high: 2, low: 1, close: 2,
  volume: 3, closed, revision: closed ? 1 : 0
});

describe("RealtimePage live isolation", () => {
  it("subscribes four charts at four different timeframes at the same time", async () => {
    const handlers = captureHandlersPerChart();
    render(<RealtimePage />);

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));
    expect([...handlers.keys()]).toEqual(["chart-1", "chart-2", "chart-3", "chart-4"]);
    // Four charts, four live timeframes, all held at once.
    expect(["chart-1", "chart-2", "chart-3", "chart-4"].map((id) => widget(id).dataset.timeframe))
      .toEqual(["5m", "15m", "1h", "4h"]);
    for (const id of ["chart-1", "chart-2", "chart-3", "chart-4"]) {
      expect(widget(id).dataset.snapshotCount).toBe("1");
      expect(widget(id).dataset.subscriptionState).toBe("live");
    }
  });

  it("applies a tick and a committed candle to the addressed chart only", async () => {
    const handlers = captureHandlersPerChart();
    render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));

    const target = handlers.get("chart-2");
    if (target === undefined) throw new Error("chart-2 did not subscribe");
    act(() => {
      target.onTick({
        schemaVersion: "v1", type: "candle.tick", subscriptionId: "chart-2",
        symbol: "BTCUSDT", timeframe: "15m", revisionWatermark: 1, sequence: 2,
        candle: liveCandle("15m", OPEN_TIME + 900_000, false)
      });
      target.onClosed({
        schemaVersion: "v1", type: "candle.closed", subscriptionId: "chart-2",
        symbol: "BTCUSDT", timeframe: "15m", revisionWatermark: 2, sequence: 3,
        candle: liveCandle("15m", OPEN_TIME + 900_000, true)
      });
    });

    expect(widget("chart-2").dataset.tickCount).toBe("1");
    expect(widget("chart-2").dataset.closedCount).toBe("1");
    expect(widget("chart-2").dataset.durableCount).toBe("2");
    // No other chart moved: each chart owns its own state, not a shared store.
    for (const id of ["chart-1", "chart-3", "chart-4"]) {
      expect(widget(id).dataset.liveUpdateCount).toBe("0");
      expect(widget(id).dataset.durableCount).toBe("1");
      expect(widget(id).dataset.formingOpenTime).toBe("");
    }
  });
});

describe("RealtimePage timeframe change isolation", () => {
  it("releases and reopens only the changed chart, leaving the other three alone", async () => {
    const captured = new Map<string, ChartHandlers>();
    const releases = new Map<string, ReturnType<typeof vi.fn>>();
    subscribe.mockImplementation((request, handlers: ChartHandlers) => {
      captured.set(request.subscriptionId, handlers);
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
        symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1,
        candles: [candle(request.timeframe)]
      });
      const release = vi.fn();
      releases.set(`${request.subscriptionId}:${request.timeframe}`, release);
      return release;
    });

    render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));

    // Give the three untouched charts live state worth losing.
    for (const [id, timeframe] of [["chart-2", "15m"], ["chart-3", "1h"], ["chart-4", "4h"]] as const) {
      const handlers = captured.get(id);
      if (handlers === undefined) throw new Error(`${id} did not subscribe`);
      act(() => {
        handlers.onTick({
          schemaVersion: "v1", type: "candle.tick", subscriptionId: id,
          symbol: "BTCUSDT", timeframe, revisionWatermark: 1, sequence: 2,
          candle: liveCandle(timeframe, OPEN_TIME + 1_000, false)
        });
      });
    }

    fireEvent.change(screen.getByRole("combobox", { name: "Timeframe for chart-1" }), {
      target: { value: "1h" }
    });
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(5));

    // chart-1: unsubscribe the old key, subscribe the new one, same identifier.
    expect(releases.get("chart-1:5m")).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[4]?.[0]).toMatchObject({
      subscriptionId: "chart-1", symbol: "BTCUSDT", timeframe: "1h"
    });
    expect(widget("chart-1").dataset.timeframe).toBe("1h");

    // chart-2..4: not released, not resubscribed, and their live state survived.
    for (const [id, timeframe] of [["chart-2", "15m"], ["chart-3", "1h"], ["chart-4", "4h"]] as const) {
      expect(releases.get(`${id}:${timeframe}`)).not.toHaveBeenCalled();
      expect(widget(id).dataset.snapshotCount).toBe("1");
      expect(widget(id).dataset.durableCount).toBe("1");
      expect(widget(id).dataset.formingOpenTime).toBe(String(OPEN_TIME + 1_000));
      expect(widget(id).dataset.subscriptionState).toBe("live");
    }
  });

  it("keeps delivering live updates to the untouched charts after the change", async () => {
    const captured = captureHandlersPerChart();
    render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));

    fireEvent.change(screen.getByRole("combobox", { name: "Timeframe for chart-1" }), {
      target: { value: "1h" }
    });
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(5));

    const untouched = captured.get("chart-3");
    if (untouched === undefined) throw new Error("chart-3 did not subscribe");
    act(() => {
      untouched.onClosed({
        schemaVersion: "v1", type: "candle.closed", subscriptionId: "chart-3",
        symbol: "BTCUSDT", timeframe: "1h", revisionWatermark: 2, sequence: 2,
        candle: liveCandle("1h", OPEN_TIME + 3_600_000, true)
      });
    });

    // The subscription chart-3 opened before the change is still delivering.
    expect(widget("chart-3").dataset.closedCount).toBe("1");
    expect(widget("chart-3").dataset.durableCount).toBe("2");
  });
});

describe("RealtimePage lifecycle and connection status", () => {
  it("releases every chart subscription when the page unmounts", async () => {
    const releases: ReturnType<typeof vi.fn>[] = [];
    subscribe.mockImplementation((request, handlers: ChartHandlers) => {
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
        symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1,
        candles: [candle(request.timeframe)]
      });
      const release = vi.fn();
      releases.push(release);
      return release;
    });

    const view = render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));
    expect(releases).toHaveLength(4);
    expect(releases.some((release) => release.mock.calls.length > 0)).toBe(false);

    view.unmount();

    // Four opened, four released. Nothing is left holding a registry entry.
    expect(releases.map((release) => release.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(connection.listeners.size).toBe(0);
  });

  it("shows one shared connection state on the page and on every chart", async () => {
    captureHandlersPerChart();
    render(<RealtimePage />);
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(4));

    const badge = () => {
      const element = document.querySelector("[data-realtime-connection]");
      if (element === null) throw new Error("connection badge is not rendered");
      return element as HTMLElement;
    };
    const chartIds = ["chart-1", "chart-2", "chart-3", "chart-4"];

    expect(badge().dataset.realtimeConnection).toBe("connected");
    expect(chartIds.map((id) => widget(id).dataset.connection))
      .toEqual(["connected", "connected", "connected", "connected"]);

    // One socket lifecycle drives all five indicators, so one event moves them
    // together instead of four sockets moving independently.
    act(() => {
      connection.state = "disconnected";
      for (const listener of connection.listeners) listener("disconnected");
    });

    expect(badge().dataset.realtimeConnection).toBe("disconnected");
    expect(chartIds.map((id) => widget(id).dataset.connection))
      .toEqual(["disconnected", "disconnected", "disconnected", "disconnected"]);
    expect(chartIds.map((id) => widget(id).dataset.subscriptionState))
      .toEqual(["disconnected", "disconnected", "disconnected", "disconnected"]);
  });
});
