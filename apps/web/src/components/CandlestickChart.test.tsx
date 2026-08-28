// @vitest-environment jsdom
// Component-state and normalized-series tests for the presentation-only market chart.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CandlestickChart } from "./CandlestickChart.js";

const chartMocks = vi.hoisted(() => ({
  addSeries: vi.fn(),
  applyOptions: vi.fn(),
  candleSetData: vi.fn(),
  createPriceLine: vi.fn(),
  createChart: vi.fn(),
  fitContent: vi.fn(),
  remove: vi.fn(),
  setMarkers: vi.fn(),
  setVisibleRange: vi.fn(),
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
    .mockImplementation(() =>
      chartMocks.addSeries.mock.calls.length % 2 === 1
        ? {
            setData: chartMocks.candleSetData,
            setMarkers: chartMocks.setMarkers,
            createPriceLine: chartMocks.createPriceLine
          }
        : { setData: chartMocks.volumeSetData }
    );
  chartMocks.createChart.mockReturnValue({
    addSeries: chartMocks.addSeries,
    applyOptions: chartMocks.applyOptions,
    priceScale: () => ({ applyOptions: vi.fn() }),
    remove: chartMocks.remove,
    timeScale: () => ({
      fitContent: chartMocks.fitContent,
      setVisibleRange: chartMocks.setVisibleRange
    })
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

  it("renders the caller's market-data failure reason", () => {
    render(
      <CandlestickChart
        state="error"
        candles={[]}
        errorMessage="requested candle count must not exceed 10000"
      />
    );
    expect(screen.getByRole("alert").textContent)
      .toContain("requested candle count must not exceed 10000");
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

  it("highlights, replaces, and clears the selected trade range", () => {
    const candle = {
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h" as const,
      openTime: 1_700_000_000_000,
      closeTime: 1_700_003_599_999,
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 12,
      closed: true,
      revision: 1
    };
    const selectedTrade = {
      sequenceNumber: 3,
      direction: "long" as const,
      entryTime: 1_700_000_000_000,
      entryPrice: 101,
      exitTime: 1_700_003_600_000,
      exitPrice: 109,
      quantity: 1,
      entryFee: 0.1,
      exitFee: 0.1,
      slippage: 0,
      profitAndLoss: 7.8,
      exitReason: "signal" as const
    };
    const replacementTrade = {
      ...selectedTrade,
      sequenceNumber: 4,
      entryTime: selectedTrade.entryTime + 1_000,
      entryPrice: 102,
      exitTime: selectedTrade.exitTime + 1_000,
      exitPrice: 108
    };

    const { rerender } = render(
      <CandlestickChart
        state="ready"
        candles={[candle]}
        trades={[selectedTrade, replacementTrade]}
        selectedTradeId={selectedTrade.sequenceNumber}
      />
    );

    expect(chartMocks.createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 101, title: "Entry" })
    );
    expect(chartMocks.createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 109, title: "Exit" })
    );
    expect(chartMocks.setVisibleRange).toHaveBeenCalledWith({
      from: selectedTrade.entryTime / 1_000,
      to: Math.floor(selectedTrade.exitTime / 1_000)
    });

    rerender(
      <CandlestickChart
        state="ready"
        candles={[candle]}
        trades={[selectedTrade, replacementTrade]}
        selectedTradeId={replacementTrade.sequenceNumber}
      />
    );
    expect(chartMocks.createPriceLine).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ price: replacementTrade.exitPrice, title: "Exit" })
    );
    expect(chartMocks.createPriceLine).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ price: replacementTrade.entryPrice, title: "Entry" })
    );
    expect(chartMocks.setVisibleRange).toHaveBeenLastCalledWith({
      from: replacementTrade.entryTime / 1_000,
      to: Math.floor(replacementTrade.exitTime / 1_000)
    });

    const highlightedCallCount = chartMocks.createPriceLine.mock.calls.length;
    rerender(
      <CandlestickChart
        state="ready"
        candles={[candle]}
        trades={[selectedTrade, replacementTrade]}
        selectedTradeId={null}
      />
    );
    expect(chartMocks.remove).toHaveBeenCalled();
    expect(chartMocks.createPriceLine).toHaveBeenCalledTimes(highlightedCallCount);
  });
});
