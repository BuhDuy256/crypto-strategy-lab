// @vitest-environment jsdom
// Public-page tests for real candle loading and independent chart state.

import type { ApiCandle, ApiTimeframe } from "@crypto-strategy-lab/api-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimePage } from "./RealtimePage.js";

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("../api/market-realtime-client.js", () => ({
  getMarketRealtimeClient: () => ({ subscribe })
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
