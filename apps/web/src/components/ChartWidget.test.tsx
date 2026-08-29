// @vitest-environment jsdom
// Public-component tests for chart data lifecycle states.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartWidget } from "./ChartWidget.js";

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("../api/market-realtime-client.js", () => ({
  getMarketRealtimeClient: () => ({ subscribe })
}));

vi.mock("./CandlestickChart.js", () => ({
  CandlestickChart: () => <div>Rendered chart</div>
}));

afterEach(() => {
  cleanup();
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
