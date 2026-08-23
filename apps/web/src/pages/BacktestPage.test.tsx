// @vitest-environment jsdom
// Page tests for recent-candle range selection, timeframe-owned data loading, and backtest running.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCandleHistory,
  createSpecification,
  startBacktest,
  getBacktestRun,
  getBacktestResult,
  getBacktestTrades
} from "../api/client.js";
import { BacktestPage, buildRecentCandleRequest } from "./BacktestPage.js";

vi.mock("../api/client.js", () => ({
  getCandleHistory: vi.fn(),
  createSpecification: vi.fn(),
  startBacktest: vi.fn(),
  getBacktestRun: vi.fn(),
  getBacktestResult: vi.fn(),
  getBacktestTrades: vi.fn()
}));
vi.mock("../components/CandlestickChart.js", () => ({
  CandlestickChart: ({ state }: { readonly state: string }) => <div>Chart: {state}</div>
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("buildRecentCandleRequest", () => {
  it("requests 200 fully closed one-hour candles", () => {
    expect(buildRecentCandleRequest("1h", Date.UTC(2026, 7, 23, 12, 34))).toEqual({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: Date.UTC(2026, 7, 15, 4),
      endTime: Date.UTC(2026, 7, 23, 11)
    });
  });
});

describe("BacktestPage market chart", () => {
  it("loads the default timeframe and reloads only chart data when it changes", async () => {
    vi.mocked(getCandleHistory).mockResolvedValue({ candles: [] });
    render(<BacktestPage />);

    await waitFor(() => expect(getCandleHistory).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getCandleHistory).mock.calls[0]?.[0].timeframe).toBe("1h");

    fireEvent.change(screen.getByLabelText("Timeframe"), { target: { value: "4h" } });

    await waitFor(() => expect(getCandleHistory).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getCandleHistory).mock.calls[1]?.[0].timeframe).toBe("4h");
  });
});

describe("BacktestPage run lifecycle", () => {
  it("starts a backtest, polls status, and displays metrics when completed", async () => {
    vi.mocked(getCandleHistory).mockResolvedValue({ candles: [] });
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-1" });
    vi.mocked(startBacktest).mockResolvedValue({ runId: "run-1", specId: "spec-1", status: "queued", attempts: 0 });
    
    let pollCount = 0;
    vi.mocked(getBacktestRun).mockImplementation(async () => {
      pollCount++;
      if (pollCount === 1) return { runId: "run-1", specId: "spec-1", status: "running", attempts: 1 };
      return { runId: "run-1", specId: "spec-1", status: "completed", attempts: 1 };
    });

    vi.mocked(getBacktestResult).mockResolvedValue({
      status: "completed",
      metrics: { totalReturn: 12.5, winRate: 60, maxDrawdown: 5, tradeCount: 10 },
      assumptions: { initialCapital: 1000, feeRate: 0.001, slippageRate: 0.001, fillRule: "close-of-bar" }
    });

    vi.mocked(getBacktestTrades).mockResolvedValue({
      trades: [],
      page: 1,
      pageSize: 20,
      totalCount: 0
    });

    render(<BacktestPage />);
    
    // Fill form
    fireEvent.change(screen.getByLabelText("Strategy"), { target: { value: "ma-crossover" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    // Wait for polling
    await waitFor(() => {
      expect(screen.getByText("Status: completed")).toBeDefined();
    }, { timeout: 5000 });

    expect(screen.getByText("Total Return: 12.5%")).toBeDefined();
    expect(screen.getByText("Win Rate: 60%")).toBeDefined();
    expect(screen.getByText("Max Drawdown: 5%")).toBeDefined();
    expect(screen.getByText("Trades: 10")).toBeDefined();
  });
});
