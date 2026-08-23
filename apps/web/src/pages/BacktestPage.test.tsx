// @vitest-environment jsdom
// Page tests for recent-candle range selection and timeframe-owned data loading.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCandleHistory } from "../api/client.js";
import { BacktestPage, buildRecentCandleRequest } from "./BacktestPage.js";

vi.mock("../api/client.js", () => ({ getCandleHistory: vi.fn() }));
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
