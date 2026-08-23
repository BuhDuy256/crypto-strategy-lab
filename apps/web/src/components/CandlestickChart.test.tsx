// @vitest-environment jsdom
// Component-state and normalized-series tests for the presentation-only market chart.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CandlestickChart } from "./CandlestickChart.js";

const chartMocks = vi.hoisted(() => ({
  addSeries: vi.fn(),
  applyOptions: vi.fn(),
  candleSetData: vi.fn(),
  createChart: vi.fn(),
  fitContent: vi.fn(),
  remove: vi.fn(),
  volumeSetData: vi.fn()
}));

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: Symbol("CandlestickSeries"),
  ColorType: { Solid: "Solid" },
  HistogramSeries: Symbol("HistogramSeries"),
  LineSeries: Symbol("LineSeries"),
  createChart: chartMocks.createChart
}));

beforeEach(() => {
  chartMocks.addSeries
    .mockReset()
    .mockReturnValueOnce({ setData: chartMocks.candleSetData, setMarkers: vi.fn(), createPriceLine: vi.fn() })
    .mockReturnValueOnce({ setData: chartMocks.volumeSetData });
  chartMocks.createChart.mockReturnValue({
    addSeries: chartMocks.addSeries,
    applyOptions: chartMocks.applyOptions,
    priceScale: () => ({ applyOptions: vi.fn() }),
    remove: chartMocks.remove,
    timeScale: () => ({ fitContent: chartMocks.fitContent, setVisibleLogicalRange: vi.fn(), coordinateToLogical: vi.fn(), timeToCoordinate: vi.fn() })
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("CandlestickChart", () => {
  it("renders a meaningful loading state", () => {
    render(<CandlestickChart state="loading" candles={[]} />);
    expect(screen.getByRole("status").textContent).toContain("Loading market data");
  });

  it("renders a meaningful empty state", () => {
    render(<CandlestickChart state="ready" candles={[]} />);
    expect(screen.getByRole("status").textContent).toContain("No candles available");
  });

  it("renders a meaningful error state", () => {
    render(<CandlestickChart state="error" candles={[]} />);
    expect(screen.getByRole("alert").textContent).toContain("Could not load market data");
  });

  it("renders normalized second-provider candle and volume input without fetching", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <CandlestickChart
        state="ready"
        candles={[
          {
            provider: "proof-provider",
            symbol: "BTCUSDT",
            timeframe: "1h",
            openTime: 1_700_000_000_000,
            closeTime: 1_700_003_599_999,
            open: 100,
            high: 120,
            low: 90,
            close: 110,
            volume: 12,
            closed: true,
            revision: 1
          }
        ]}
      />
    );

    expect(chartMocks.candleSetData).toHaveBeenCalledWith([
      { time: 1_700_000_000, open: 100, high: 120, low: 90, close: 110 }
    ]);
    expect(chartMocks.volumeSetData).toHaveBeenCalledWith([
      { time: 1_700_000_000, value: 12, color: "#2da44e88" }
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
