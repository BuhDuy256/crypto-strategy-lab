// @vitest-environment jsdom
// Public-component tests for chart data lifecycle states.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCandleHistory } from "../api/client.js";
import { ChartWidget } from "./ChartWidget.js";

vi.mock("../api/client.js", () => ({
  getCandleHistory: vi.fn()
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
    vi.mocked(getCandleHistory).mockImplementation(() => new Promise(() => undefined));

    render(<ChartWidget id="chart-1" initialTimeframe="5m" />);

    expect(screen.getByText("Loading market data...")).not.toBeNull();
  });

  it("shows an empty state when the candle API returns no history", async () => {
    vi.mocked(getCandleHistory).mockResolvedValue({ candles: [] });

    render(<ChartWidget id="chart-1" initialTimeframe="5m" />);

    expect(
      await screen.findByText("No candle data is available for this timeframe.")
    ).not.toBeNull();
  });

  it("shows the API error instead of hiding a failed candle request", async () => {
    vi.mocked(getCandleHistory).mockRejectedValue(new Error("market history unavailable"));

    render(<ChartWidget id="chart-1" initialTimeframe="5m" />);

    expect(await screen.findByText("Failed to load market data")).not.toBeNull();
    expect(screen.getByText("market history unavailable")).not.toBeNull();
  });
});
