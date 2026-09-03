// @vitest-environment jsdom
// Page tests for the Discovery page: it renders progress and the leaderboard
// from a swappable data source, restores from a stored snapshot on refresh,
// reflects the converged control state, feeds the generator selector from the
// catalog, starts a configured run, and opens an entry's detail.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LeaderboardResponse,
  SearchProgressResponse
} from "@crypto-strategy-lab/api-contracts";
import {
  createSearchExperiment,
  getBacktestProvenance,
  getBacktestResult,
  getBacktestTrades,
  getCandleHistory,
  getGenerators,
  getStrategies,
  pauseSearch,
  startSearch
} from "../api/client.js";
import { DiscoveryPage } from "./DiscoveryPage.js";
import type { SearchDataSource } from "./discovery-data-source.js";

vi.mock("../api/client.js", () => ({
  getGenerators: vi.fn(),
  getStrategies: vi.fn(),
  createSearchExperiment: vi.fn(),
  startSearch: vi.fn(),
  pauseSearch: vi.fn(),
  resumeSearch: vi.fn(),
  cancelSearch: vi.fn(),
  getSearchProgress: vi.fn(),
  getLeaderboard: vi.fn(),
  getBacktestResult: vi.fn(),
  getBacktestTrades: vi.fn(),
  getBacktestProvenance: vi.fn(),
  getCandleHistory: vi.fn()
}));
vi.mock("../components/CandlestickChart.js", () => ({
  CandlestickChart: ({ state }: { readonly state: string }) => <div>Chart: {state}</div>
}));

const specId = "spec-1";

function progress(overrides: Partial<SearchProgressResponse> = {}): SearchProgressResponse {
  return {
    specId,
    status: "running",
    stopReason: null,
    generated: 3,
    submitted: 3,
    completed: 2,
    failed: 0,
    cancelled: 0,
    inFlight: 1,
    ...overrides
  };
}

function leaderboard(overrides: Partial<LeaderboardResponse> = {}): LeaderboardResponse {
  return {
    specId,
    sort: "rank",
    entries: [
      {
        rank: 1,
        runId: "run-1",
        resultId: "result-1",
        contentHash: "hash-1",
        score: 0.42,
        strategy: { kind: "single", id: "rsi", version: "1.0.0", parameters: { period: 14 } },
        metrics: { totalReturn: 12.5, winRate: 60, maximumDrawdown: 5, numberOfTrades: 8 }
      }
    ],
    ...overrides
  };
}

function fakeSource(
  overrides: Partial<SearchDataSource> = {}
): SearchDataSource {
  return {
    getProgress: vi.fn(() => Promise.resolve(progress())),
    getLeaderboard: vi.fn(() => Promise.resolve(leaderboard())),
    ...overrides
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear()
    }
  });
  vi.mocked(getGenerators).mockResolvedValue({
    generators: [
      { id: "random-search", version: "1.0.0", name: "Random Search", description: "", configurationSchema: { properties: {}, required: [] } }
    ]
  });
  vi.mocked(getStrategies).mockResolvedValue({
    strategies: [
      { id: "rsi", version: "1.0.0", name: "RSI", description: "", category: "momentum", capabilities: ["long"], parameterSchema: { properties: { period: { type: "integer", label: "Period" } }, required: ["period"] }, requiredInputs: [] }
    ]
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DiscoveryPage read layer", () => {
  it("renders progress and the leaderboard from an injected data source", async () => {
    window.localStorage.setItem("discovery.specId", specId);
    const source = fakeSource();
    render(<DiscoveryPage dataSource={source} pollMs={100000} />);

    await waitFor(() => expect(screen.getByText("Status: running")).toBeDefined());
    expect(source.getProgress).toHaveBeenCalledWith(specId);
    // The counts are shown as labelled cards and the metrics are formatted for
    // reading; the values themselves still come straight from the data source.
    const completed = screen.getByText("Completed").closest("li");
    expect(completed?.textContent).toBe("Completed2");
    // A candidate is named the way the catalog names it, and the parameters that
    // tell two candidates of the same strategy apart are written underneath. The
    // exact identifier and version stay reachable for traceability.
    // Scoped to the leaderboard cell on purpose: "RSI" is also the label of the
    // strategy pool checkbox further up the page.
    const candidate = screen.getByText("RSI", { selector: ".strategy-title" });
    expect(screen.getByText("Period: 14")).toBeDefined();
    expect(candidate.closest(".strategy-label")?.getAttribute("title")).toBe("rsi@1.0.0");
    expect(screen.getByText("1,250%")).toBeDefined();
  });

  it("restores the last run from storage on refresh", async () => {
    window.localStorage.setItem("discovery.specId", specId);
    const source = fakeSource();
    render(<DiscoveryPage dataSource={source} pollMs={100000} />);
    await waitFor(() => expect(source.getLeaderboard).toHaveBeenCalledWith(specId, "rank"));
    expect(screen.getByText("Leaderboard")).toBeDefined();
  });
});

describe("DiscoveryPage controls", () => {
  it("shows the converged state returned by a control action, not an optimistic one", async () => {
    window.localStorage.setItem("discovery.specId", specId);
    vi.mocked(pauseSearch).mockResolvedValue(progress({ status: "pausing", inFlight: 1 }));
    render(<DiscoveryPage dataSource={fakeSource()} pollMs={100000} />);

    await waitFor(() => expect(screen.getByText("Status: running")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    await waitFor(() => expect(screen.getByText("Status: pausing")).toBeDefined());
    expect(pauseSearch).toHaveBeenCalledWith(specId);
  });
});

describe("DiscoveryPage generator selector", () => {
  it("lists generators from the catalog rather than a hard-coded set", async () => {
    vi.mocked(getGenerators).mockResolvedValue({
      generators: [
        { id: "random-search", version: "1.0.0", name: "Random Search", description: "", configurationSchema: { properties: {}, required: [] } },
        { id: "grid-search", version: "2.0.0", name: "Grid Search", description: "", configurationSchema: { properties: {}, required: [] } }
      ]
    });
    render(<DiscoveryPage dataSource={fakeSource()} />);

    const select = await screen.findByLabelText("Search method");
    expect(within(select).getByText("Random Search")).toBeDefined();
    expect(within(select).getByText("Grid Search")).toBeDefined();
  });
});

describe("DiscoveryPage start", () => {
  it("creates a configured search experiment and starts it", async () => {
    vi.mocked(createSearchExperiment).mockResolvedValue({ specId });
    vi.mocked(startSearch).mockResolvedValue(progress({ status: "running" }));
    const source = fakeSource();
    render(<DiscoveryPage dataSource={source} pollMs={100000} />);

    // Wait for the catalogs to populate the default selections.
    await screen.findByLabelText("RSI");
    fireEvent.click(screen.getByRole("button", { name: "Start Search" }));

    await waitFor(() => expect(createSearchExperiment).toHaveBeenCalledTimes(1));
    const request = vi.mocked(createSearchExperiment).mock.calls[0]![0];
    expect(request.dataset.timeframe).toBe("1h");
    expect(request.generator.id).toBe("random-search");
    expect(request.searchSpace.strategies).toEqual([{ id: "rsi", version: "1.0.0" }]);
    expect(request.stopConditions).toEqual({ maxCandidates: 20 });
    expect(request.maxInFlight).toBe(2);
    expect(startSearch).toHaveBeenCalledWith(specId);
    expect(window.localStorage.getItem("discovery.specId")).toBe(specId);
  });
});

describe("DiscoveryPage entry detail", () => {
  it("opens a leaderboard entry's trades and provenance", async () => {
    window.localStorage.setItem("discovery.specId", specId);
    vi.mocked(getBacktestResult).mockResolvedValue({ runId: "run-1", status: "completed", annotations: [] } as never);
    vi.mocked(getBacktestTrades).mockResolvedValue({
      runId: "run-1",
      status: "completed",
      trades: [
        { sequenceNumber: 0, direction: "long", entryTime: 1000, entryPrice: 1, exitTime: 2000, exitPrice: 2, quantity: 1, entryFee: 0, exitFee: 0, slippage: 0, profitAndLoss: 1, exitReason: "signal" }
      ],
      page: { pageNumber: 1, pageSize: 20, totalCount: 1 }
    });
    vi.mocked(getBacktestProvenance).mockResolvedValue({
      runId: "run-1",
      resultId: "result-1",
      completedAt: "t",
      tradeContentHash: "h",
      checklist: { specification: { status: "recorded" } },
      attempts: []
    });
    vi.mocked(getCandleHistory).mockResolvedValue({ candles: [] });

    render(<DiscoveryPage dataSource={fakeSource()} pollMs={100000} />);
    await waitFor(() =>
      expect(screen.getByText("RSI", { selector: ".strategy-title" })).toBeDefined()
    );

    fireEvent.click(screen.getByText("RSI", { selector: ".strategy-title" }));

    await waitFor(() => expect(getBacktestProvenance).toHaveBeenCalledWith("run-1"));
    expect(getBacktestTrades).toHaveBeenCalledWith("run-1", 1, 20);
    await waitFor(() => expect(screen.getByText("specification: recorded")).toBeDefined());
  });
});
