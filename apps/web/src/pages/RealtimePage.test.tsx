// @vitest-environment jsdom
// Public-page tests for real candle loading and independent chart state.

import type { ApiCandle, ApiTimeframe } from "@crypto-strategy-lab/api-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCandleHistory } from "../api/client.js";
import { RealtimePage } from "./RealtimePage.js";

vi.mock("../api/client.js", () => ({
  getCandleHistory: vi.fn()
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
  vi.mocked(getCandleHistory).mockImplementation(async (request) => ({
    candles: [candle(request.timeframe)]
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RealtimePage charts", () => {
  it("loads four distinct chart identities and timeframes through the candle API", async () => {
    render(<RealtimePage />);

    await waitFor(() => expect(getCandleHistory).toHaveBeenCalledTimes(4));
    expect(vi.mocked(getCandleHistory).mock.calls.map(([request]) => request.timeframe)).toEqual([
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
    await waitFor(() => expect(getCandleHistory).toHaveBeenCalledTimes(4));

    fireEvent.change(screen.getByRole("combobox", { name: "Timeframe for chart-1" }), {
      target: { value: "1h" }
    });

    await waitFor(() => expect(getCandleHistory).toHaveBeenCalledTimes(5));
    expect(vi.mocked(getCandleHistory).mock.calls[4]?.[0].timeframe).toBe("1h");
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
