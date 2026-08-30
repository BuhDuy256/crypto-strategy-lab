// @vitest-environment jsdom
// Public-component tests for chart data lifecycle states.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartWidget } from "./ChartWidget.js";

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

const chartProps: Record<string, unknown>[] = [];
vi.mock("./CandlestickChart.js", () => ({
  CandlestickChart: (props: Record<string, unknown>) => {
    chartProps.push(props);
    return <div>Rendered chart</div>;
  }
}));

afterEach(() => {
  cleanup();
  chartProps.length = 0;
  vi.clearAllMocks();
});

describe("ChartWidget data states", () => {
  it("shows a loading state while candle history is pending", () => {
    subscribe.mockReturnValue(() => undefined);

    render(<ChartWidget id="chart-1" initialTimeframe="5m" />);

    expect(screen.getByText("Loading market data...")).not.toBeNull();
  });

  it("shows an empty state when the durable snapshot has no history", async () => {
    subscribe.mockImplementation((_request, handlers) => {
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 0, candles: []
      });
      return () => undefined;
    });

    render(<ChartWidget id="chart-1" initialTimeframe="5m" />);

    expect(
      await screen.findByText("No candle data is available for this timeframe.")
    ).not.toBeNull();
  });

  it("shows the gateway error instead of hiding a failed snapshot", async () => {
    subscribe.mockImplementation((_request, handlers) => {
      handlers.onError("market history unavailable");
      return () => undefined;
    });

    render(<ChartWidget id="chart-1" initialTimeframe="5m" />);

    expect(await screen.findByText("Failed to load market data")).not.toBeNull();
    expect(screen.getByText("market history unavailable")).not.toBeNull();
  });
});

type Handlers = Parameters<typeof subscribe>[1];

const candle = (openTime: number, closed: boolean, close = 2) => ({
  provider: "binance", symbol: "BTCUSDT", timeframe: "5m" as const,
  openTime, closeTime: openTime + 60_000, open: 1, high: 2, low: 1, close,
  volume: 3, closed, revision: closed ? 1 : 0
});

/** Renders the widget and hands back the handlers the client was given. */
function renderWithHandlers(): { handlers: Handlers; widget: () => HTMLElement } {
  let captured: Handlers | undefined;
  subscribe.mockImplementation((_request: unknown, handlers: Handlers) => {
    captured = handlers;
    return () => undefined;
  });
  render(<ChartWidget id="chart-1" initialTimeframe="5m" />);
  if (captured === undefined) throw new Error("ChartWidget did not subscribe");
  const handlers = captured;
  return {
    handlers,
    widget: () => {
      const element = document.querySelector('[data-chart-id="chart-1"]');
      if (element === null) throw new Error("chart widget is not rendered");
      return element as HTMLElement;
    }
  };
}

describe("ChartWidget live candle application", () => {
  it("applies a tick to the forming bar only, never to the durable series", () => {
    const { handlers, widget } = renderWithHandlers();

    act(() => {
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4,
        candles: [candle(0, true), candle(60_000, true)]
      });
    });
    act(() => {
      handlers.onTick({
        schemaVersion: "v1", type: "candle.tick", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4, sequence: 9,
        candle: { ...candle(120_000, false), closed: false }
      });
      handlers.onTick({
        schemaVersion: "v1", type: "candle.tick", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4, sequence: 10,
        candle: { ...candle(120_000, false, 7), closed: false }
      });
    });

    expect(widget().dataset.tickCount).toBe("2");
    // Two ticks for the same forming bar: the durable series must not have grown.
    expect(widget().dataset.durableCount).toBe("2");
    expect(widget().dataset.formingOpenTime).toBe("120000");
  });

  it("applies a candle that overlaps the snapshot once and closes the forming bar", () => {
    const { handlers, widget } = renderWithHandlers();

    act(() => {
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4,
        candles: [candle(0, true), candle(60_000, true)]
      });
    });
    act(() => {
      handlers.onTick({
        schemaVersion: "v1", type: "candle.tick", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4, sequence: 9,
        candle: { ...candle(120_000, false), closed: false }
      });
    });
    act(() => {
      // Same open time as a snapshot candle: a replacement, not a second bar.
      handlers.onClosed({
        schemaVersion: "v1", type: "candle.closed", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 5, sequence: 10,
        candle: candle(60_000, true, 9)
      });
      handlers.onClosed({
        schemaVersion: "v1", type: "candle.closed", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 6, sequence: 11,
        candle: candle(120_000, true, 5)
      });
    });

    expect(widget().dataset.closedCount).toBe("2");
    // 0 and 60000 from the snapshot, 120000 committed. The overlap did not duplicate.
    expect(widget().dataset.durableCount).toBe("3");
    // The committed candle took over the bar that was forming.
    expect(widget().dataset.formingOpenTime).toBe("");
  });

  it("drops the forming bar when a fresh snapshot arrives after a reconnect", () => {
    const { handlers, widget } = renderWithHandlers();

    act(() => {
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4,
        candles: [candle(0, true)]
      });
      handlers.onTick({
        schemaVersion: "v1", type: "candle.tick", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4, sequence: 9,
        candle: { ...candle(60_000, false), closed: false }
      });
    });
    expect(widget().dataset.formingOpenTime).toBe("60000");

    act(() => {
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 7,
        candles: [candle(0, true), candle(60_000, true)]
      });
    });

    expect(widget().dataset.snapshotCount).toBe("2");
    expect(widget().dataset.snapshotWatermark).toBe("7");
    expect(widget().dataset.durableCount).toBe("2");
    expect(widget().dataset.formingOpenTime).toBe("");
  });

  it("unsubscribes when the chart unmounts", () => {
    const release = vi.fn();
    subscribe.mockReturnValue(release);

    const view = render(<ChartWidget id="chart-1" initialTimeframe="5m" />);
    expect(release).not.toHaveBeenCalled();
    view.unmount();

    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("ChartWidget renderer boundary", () => {
  it("hands the renderer candles and nothing about the subscription", () => {
    const { handlers } = renderWithHandlers();

    act(() => {
      handlers.onSnapshot({
        schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4,
        candles: [candle(0, true)]
      });
      handlers.onTick({
        schemaVersion: "v1", type: "candle.tick", subscriptionId: "chart-1",
        symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 4, sequence: 9,
        candle: { ...candle(60_000, false), closed: false }
      });
    });

    const last = chartProps[chartProps.length - 1];
    if (last === undefined) throw new Error("the renderer was never called");
    // The MKT-05 renderer still takes candles and a display state. No
    // subscription identifier, timeframe, socket, or protocol reaches it, and
    // the forming bar arrives as one more candle rather than as live plumbing.
    expect(Object.keys(last).sort()).toEqual(["candles", "state"]);
    expect((last.candles as readonly { readonly openTime: number }[]).map((item) => item.openTime))
      .toEqual([0, 60_000]);
  });
});
