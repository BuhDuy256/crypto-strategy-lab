// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";

vi.mock("./api/client.js", () => ({
  getHealth: vi.fn(async () => ({ status: "ok" })),
  getProviderHealth: vi.fn(async () => ({
    provider: "binance",
    status: "healthy",
    checkedAt: 1_700_000_000_000
  })),
  getCandleHistory: vi.fn(async () => ({ candles: [] })),
  getNewsItems: vi.fn(async () => ({
    items: [], page: { pageNumber: 1, pageSize: 10, totalCount: 0 }
  })),
  getNewsSentimentDistribution: vi.fn(async () => ({
    window: { startAt: 0, endAt: 0 }, itemCount: 0, positive: 0, neutral: 0, negative: 0
  })),
  getNewsHealth: vi.fn(async () => ({
    collection: [],
    analysis: { status: "unavailable", pendingCount: 0, degradedCount: 0, checkedAt: 0 }
  })),
  getStrategies: vi.fn(async () => ({ strategies: [] })),
  listComposites: vi.fn(async () => []),
  getGenerators: vi.fn(async () => ({ generators: [] })),
  createComposite: vi.fn(async () => ({ id: "comp-1" })),
  evaluateComposite: vi.fn(async () => ({ action: "hold", effectiveTime: 0 }))
}));

afterEach(() => {
  cleanup();
});

describe("App routing and shell", () => {
  it("redirects the index route to Backtest", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Backtest" })).not.toBeNull();
  });

  it("navigates between all five routes without unmounting the shell", async () => {
    render(
      <MemoryRouter initialEntries={["/backtest"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Backtest" })).not.toBeNull();

    const routes: Array<[string, string]> = [
      ["Realtime", "Realtime Markets"],
      ["Strategy Engine", "Strategy Engine"],
      ["Discovery", "Discovery"],
      ["News", "News"],
      ["Backtest", "Backtest"]
    ];

    for (const [linkName, heading] of routes) {
      fireEvent.click(screen.getByRole("link", { name: linkName }));
      expect(await screen.findByRole("heading", { name: heading })).not.toBeNull();
    }

    // The shell (header/nav) never remounts across navigation, so the
    // health status region stays present throughout.
    expect(screen.getByText("Backend: ok")).not.toBeNull();
  });

  it("displays live backend health obtained through the typed API client", async () => {
    render(
      <MemoryRouter initialEntries={["/backtest"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("Backend: ok")).not.toBeNull();
  });
});
