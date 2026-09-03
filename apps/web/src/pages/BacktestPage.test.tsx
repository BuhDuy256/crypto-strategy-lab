// @vitest-environment jsdom
// Page tests for the Backtest page: window selection, catalog-driven strategy
// choice, the request the page actually sends, the run lifecycle, failure
// states, paging, and trade-row selection.
//
// The API client is mocked, but every test that starts a run asserts the shape
// and content of the specification request. A malformed or invented payload
// must fail here, which is the failure the earlier version of this test missed.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ApiBacktestTrade,
  ApiStrategyDescriptor,
  BacktestRunResponse,
  CompletedBacktestResultResponse
} from "@crypto-strategy-lab/api-contracts";
import {
  getCandleHistory,
  createSpecification,
  getStrategies,
  listComposites,
  startBacktest,
  getBacktestRun,
  getBacktestResult,
  getBacktestTrades
} from "../api/client.js";
import { BacktestPage, buildRecentCandleRequest } from "./BacktestPage.js";

vi.mock("../api/client.js", () => ({
  getCandleHistory: vi.fn(),
  createSpecification: vi.fn(),
  getStrategies: vi.fn(),
  listComposites: vi.fn(),
  startBacktest: vi.fn(),
  getBacktestRun: vi.fn(),
  getBacktestResult: vi.fn(),
  getBacktestTrades: vi.fn()
}));
vi.mock("../components/CandlestickChart.js", () => ({
  CandlestickChart: ({
    state,
    selectedTradeId,
    errorMessage
  }: {
    readonly state: string;
    readonly selectedTradeId: number | null;
    readonly errorMessage: string | null;
  }) => (
    <div>
      <div>Chart: {state}</div>
      <div>Selected trade: {String(selectedTradeId)}</div>
      <div>Chart error: {String(errorMessage)}</div>
    </div>
  )
}));

// A catalog fixture. These identifiers exist only in this test file; the page
// itself must never name a strategy.
const FIRST_STRATEGY: ApiStrategyDescriptor = {
  id: "test-strategy-one",
  version: "1.0.0",
  name: "Test strategy one",
  description: "First catalog entry.",
  category: "trend",
  capabilities: ["long", "short"],
  parameterSchema: {
    properties: {
      fastPeriod: { type: "integer", label: "Fast period", default: 10 }
    },
    required: ["fastPeriod"]
  },
  requiredInputs: ["price-bars"]
};

const SECOND_STRATEGY: ApiStrategyDescriptor = {
  id: "test-strategy-two",
  version: "2.1.0",
  name: "Test strategy two",
  description: "Second catalog entry.",
  category: "momentum",
  capabilities: ["long"],
  parameterSchema: {
    properties: {
      lookback: { type: "integer", label: "Lookback", default: 7 }
    },
    required: ["lookback"]
  },
  requiredInputs: ["price-bars"]
};

const RUN_ID = "11111111-1111-4111-8111-111111111111";

function run(status: BacktestRunResponse["status"]): BacktestRunResponse {
  return {
    runId: RUN_ID,
    specId: "spec-1",
    candidateId: "candidate-1",
    idempotencyKey: "key-1",
    status,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  };
}

function completedResult(): CompletedBacktestResultResponse {
  return {
    runId: RUN_ID,
    status: "completed",
    resultId: "result-1",
    specId: "spec-1",
    specificationHash: "a".repeat(64),
    metricSet: { id: "mvp-metrics", version: "1.0.0" },
    metrics: { totalReturn: 0.125, winRate: 0.6, maximumDrawdown: 0.05, numberOfTrades: 10 },
    executionAssumptions: {
      initialCapital: 10_000,
      feeRate: 0.001,
      slippageRate: 0.0005,
      signalTiming: "close-of-bar",
      fillRule: "next-open",
      maxConcurrentPositions: 1,
      leverage: 1,
      positionSizing: "available-equity",
      allowedDirections: ["long", "short"],
      stopLoss: { enabled: false },
      takeProfit: { enabled: false },
      sameBarExitPriority: "stop-loss-first",
      finalPositionPolicy: "liquidate-at-final-close",
      decimalPlaces: 8
    },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T01:00:00.000Z",
    completedAt: "2024-01-01T01:00:00.000Z",
    annotations: []
  };
}

function trade(sequenceNumber: number): ApiBacktestTrade {
  return {
    sequenceNumber,
    direction: "long",
    entryTime: 1_704_067_200_000 + sequenceNumber * 3_600_000,
    entryPrice: 42_000 + sequenceNumber,
    exitTime: 1_704_070_800_000 + sequenceNumber * 3_600_000,
    exitPrice: 42_500 + sequenceNumber,
    quantity: 0.1,
    entryFee: 4.2,
    exitFee: 4.25,
    slippage: 0.5,
    profitAndLoss: 49.5,
    exitReason: "signal"
  };
}

function mockHealthyCatalogAndChart(): void {
  vi.mocked(getCandleHistory).mockResolvedValue({ candles: [] });
  vi.mocked(getStrategies).mockResolvedValue({
    strategies: [FIRST_STRATEGY, SECOND_STRATEGY]
  });
  vi.mocked(listComposites).mockResolvedValue([]);
}

async function renderPageWithCatalog(): Promise<void> {
  render(<BacktestPage />);
  await waitFor(() => expect(screen.getByLabelText("Strategy")).toBeDefined());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Reads the number a metric card shows, by its visible label. Scoped to the
 * metric cards on purpose: "Trades" is also a section heading further down.
 */
function metricValue(label: string): string | undefined {
  const card = [...document.querySelectorAll(".metric-card")].find(
    (element) => element.querySelector(".metric-label")?.textContent === label
  );
  return card?.querySelector(".metric-value")?.textContent ?? undefined;
}

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
    mockHealthyCatalogAndChart();
    render(<BacktestPage />);

    await waitFor(() => expect(getCandleHistory).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getCandleHistory).mock.calls[0]?.[0].timeframe).toBe("1h");

    fireEvent.change(screen.getByLabelText("Timeframe"), { target: { value: "4h" } });

    await waitFor(() => expect(getCandleHistory).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getCandleHistory).mock.calls[1]?.[0].timeframe).toBe("4h");
  });

  // The server refuses a candle read wider than its own cap, which a wide window
  // at a fine timeframe reaches. The backtest has no such cap, so the page must
  // say why the drawing is missing instead of showing a bare failure.
  it("shows the server's own reason when the chart data cannot be loaded", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(getCandleHistory).mockRejectedValue(
      new Error("requested candle count must not exceed 10000")
    );
    render(<BacktestPage />);

    await waitFor(() => expect(screen.getByText("Chart: error")).toBeDefined());
    expect(
      screen.getByText("Chart error: requested candle count must not exceed 10000")
    ).toBeDefined();
  });
});

describe("BacktestPage strategy catalog", () => {
  it("lists every catalog strategy by name and selects the first one", async () => {
    mockHealthyCatalogAndChart();
    await renderPageWithCatalog();

    const select = screen.getByLabelText("Strategy");
    expect(within(select).getByText("Test strategy one")).toBeDefined();
    expect(within(select).getByText("Test strategy two")).toBeDefined();
    expect((select as HTMLSelectElement).value).toBe(FIRST_STRATEGY.id);
  });

  it("renders the selected strategy's parameters from its schema", async () => {
    mockHealthyCatalogAndChart();
    await renderPageWithCatalog();

    expect(screen.getByText(/Fast period/)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Strategy"), { target: { value: SECOND_STRATEGY.id } });

    await waitFor(() => expect(screen.getByText(/Lookback/)).toBeDefined());
    expect(screen.queryByText(/Fast period/)).toBeNull();
  });

  it("reports a catalog failure instead of showing an empty selector", async () => {
    vi.mocked(getCandleHistory).mockResolvedValue({ candles: [] });
    vi.mocked(getStrategies).mockRejectedValue(new Error("catalog unavailable"));

    render(<BacktestPage />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("catalog unavailable")
    );
  });

  it("keeps built-in strategies usable when saved composites cannot be listed", async () => {
    vi.mocked(getCandleHistory).mockResolvedValue({ candles: [] });
    vi.mocked(getStrategies).mockResolvedValue({ strategies: [FIRST_STRATEGY] });
    vi.mocked(listComposites).mockRejectedValue(new Error("composite store unavailable"));

    await renderPageWithCatalog();

    expect((screen.getByLabelText("Strategy") as HTMLSelectElement).value)
      .toBe(FIRST_STRATEGY.id);
    expect(screen.getByRole("alert").textContent)
      .toContain("composite store unavailable");
  });
});

describe("BacktestPage specification request", () => {
  it("lists a saved composite and submits its immutable id and version", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(listComposites).mockResolvedValue([{
      id: "composite-real",
      version: "1.0.0",
      name: "Real composite",
      description: "Saved on the server.",
      components: [],
      policy: { id: "majority-vote", version: "1.0.0", configuration: {} },
      descriptor: {
        id: "composite-real",
        version: "1.0.0",
        name: "Real composite",
        description: "Saved on the server.",
        category: "composite",
        capabilities: ["long", "short", "annotations"],
        parameterSchema: { properties: {}, required: [] },
        requiredInputs: ["price-bars"]
      }
    }]);
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-composite" });
    vi.mocked(startBacktest).mockResolvedValue(run("queued"));

    await renderPageWithCatalog();
    fireEvent.change(screen.getByLabelText("Strategy"), {
      target: { value: "composite-real" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    await waitFor(() => expect(createSpecification).toHaveBeenCalledTimes(1));
    expect(createSpecification).toHaveBeenCalledWith(expect.objectContaining({
      strategy: { id: "composite-real", version: "1.0.0", parameters: {} }
    }));
  });

  it("offers the supported V1 symbol as a configuration choice", async () => {
    mockHealthyCatalogAndChart();
    await renderPageWithCatalog();

    const symbol = screen.getByLabelText("Symbol") as HTMLSelectElement;
    expect(symbol.value).toBe("BTCUSDT");
    expect(within(symbol).getByText("BTCUSDT")).toBeDefined();
  });

  it("sends the dataset window and the catalog strategy, and nothing the backend owns", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-1" });
    vi.mocked(startBacktest).mockResolvedValue(run("queued"));
    vi.mocked(getBacktestRun).mockResolvedValue(run("queued"));
    await renderPageWithCatalog();

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2024-01-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2024-02-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    await waitFor(() => expect(createSpecification).toHaveBeenCalledTimes(1));
    const request = vi.mocked(createSpecification).mock.calls[0]?.[0];

    expect(request).toEqual({
      schemaVersion: "v1",
      dataset: {
        provider: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        // Both bounds are snapped to 1h candle open times, which is what a
        // dataset window is addressed by.
        startTime: Date.parse("2024-01-01T00:00:00.000Z"),
        endTime: Date.parse("2024-02-11T23:00:00.000Z")
      },
      strategy: {
        id: FIRST_STRATEGY.id,
        version: FIRST_STRATEGY.version,
        parameters: { fastPeriod: 10 }
      }
    });
    // The execution profile, the metric set, the dataset manifest, and the
    // provenance are backend-owned. The page must not send any of them.
    expect(Object.keys(request ?? {})).toEqual(["schemaVersion", "dataset", "strategy"]);

    await waitFor(() => expect(startBacktest).toHaveBeenCalledWith({ specId: "spec-1" }));
  });

  it("uses the version of whichever strategy the catalog selection names", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-2" });
    vi.mocked(startBacktest).mockResolvedValue(run("queued"));
    vi.mocked(getBacktestRun).mockResolvedValue(run("queued"));
    await renderPageWithCatalog();

    fireEvent.change(screen.getByLabelText("Strategy"), { target: { value: SECOND_STRATEGY.id } });
    await waitFor(() => expect(screen.getByText(/Lookback/)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    await waitFor(() => expect(createSpecification).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createSpecification).mock.calls[0]?.[0].strategy).toEqual({
      id: SECOND_STRATEGY.id,
      version: SECOND_STRATEGY.version,
      parameters: { lookback: 7 }
    });
  });

  it("shows the reason when the specification is rejected", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(createSpecification).mockRejectedValue(
      new Error("Request to /specifications failed with status 400")
    );
    await renderPageWithCatalog();

    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("failed with status 400")
    );
    expect(startBacktest).not.toHaveBeenCalled();
  });
});

describe("BacktestPage run lifecycle", () => {
  it("starts a backtest, polls status, and displays the backend metrics when completed", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-1" });
    vi.mocked(startBacktest).mockResolvedValue(run("queued"));

    let pollCount = 0;
    vi.mocked(getBacktestRun).mockImplementation(async () => {
      pollCount += 1;
      return pollCount === 1 ? run("running") : run("completed");
    });
    vi.mocked(getBacktestResult).mockResolvedValue(completedResult());
    vi.mocked(getBacktestTrades).mockResolvedValue({
      runId: RUN_ID,
      status: "completed",
      trades: [],
      page: { pageNumber: 1, pageSize: 20, totalCount: 0 }
    });

    await renderPageWithCatalog();
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    await waitFor(() => expect(screen.getByText("Status: queued")).toBeDefined());
    await waitFor(() => expect(screen.getByText("Status: running")).toBeDefined(), { timeout: 5_000 });
    await waitFor(() => expect(screen.getByText("Status: completed")).toBeDefined(), { timeout: 5_000 });
    // The backend still owns every number; the page only writes each one in a
    // readable form next to its label.
    await waitFor(() => expect(metricValue("Total return")).toBe("12.5%"));

    expect(metricValue("Win rate")).toBe("60%");
    expect(metricValue("Max drawdown")).toBe("5%");
    expect(metricValue("Trades")).toBe("10");
    expect(screen.getByText("Fill rule").parentElement?.textContent)
      .toBe("Fill rulenext-open");
    expect(screen.getByText("Initial capital").parentElement?.textContent)
      .toBe("Initial capital10,000.00");
    // The full hash stays reachable; only its rendering is shortened.
    const hash = screen.getByText("Specification hash").parentElement
      ?.querySelector(".provenance-value");
    expect(hash?.getAttribute("title")).toBe("a".repeat(64));
  });

  it("renders an empty state for a result with zero trades", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-1" });
    vi.mocked(startBacktest).mockResolvedValue(run("completed"));
    vi.mocked(getBacktestRun).mockResolvedValue(run("completed"));
    vi.mocked(getBacktestResult).mockResolvedValue({
      ...completedResult(),
      metrics: { totalReturn: 0, winRate: 0, maximumDrawdown: 0, numberOfTrades: 0 }
    });
    vi.mocked(getBacktestTrades).mockResolvedValue({
      runId: RUN_ID,
      status: "completed",
      trades: [],
      page: { pageNumber: 1, pageSize: 20, totalCount: 0 }
    });

    await renderPageWithCatalog();
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    await waitFor(() => expect(screen.getByText("No trades executed.")).toBeDefined());
    expect(metricValue("Trades")).toBe("0");
  });

  it("shows the failure reason instead of hanging on running", async () => {
    mockHealthyCatalogAndChart();
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-1" });
    vi.mocked(startBacktest).mockResolvedValue(run("failed"));
    vi.mocked(getBacktestRun).mockResolvedValue(run("failed"));
    vi.mocked(getBacktestResult).mockResolvedValue({
      runId: RUN_ID,
      status: "failed",
      failureReason: "DATASET_EMPTY: no candles in range",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:01:00.000Z"
    });

    await renderPageWithCatalog();
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));

    await waitFor(() =>
      expect(screen.getByText("Error: DATASET_EMPTY: no candles in range")).toBeDefined()
    );
    expect(screen.getByText("Status: failed")).toBeDefined();
    expect(getBacktestTrades).not.toHaveBeenCalled();
  });
});

describe("BacktestPage trade table and selection", () => {
  async function renderCompletedRunWithTrades(): Promise<void> {
    mockHealthyCatalogAndChart();
    vi.mocked(createSpecification).mockResolvedValue({ specId: "spec-1" });
    vi.mocked(startBacktest).mockResolvedValue(run("completed"));
    vi.mocked(getBacktestRun).mockResolvedValue(run("completed"));
    vi.mocked(getBacktestResult).mockResolvedValue(completedResult());
    vi.mocked(getBacktestTrades).mockImplementation(async (_runId, pageNumber = 1) => ({
      runId: RUN_ID,
      status: "completed",
      trades: pageNumber === 1 ? [trade(0), trade(1)] : [trade(20)],
      page: { pageNumber, pageSize: 20, totalCount: 21 }
    }));

    await renderPageWithCatalog();
    fireEvent.click(screen.getByRole("button", { name: "Start Backtest" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
  }

  it("pages against the server rather than loading every trade at once", async () => {
    await renderCompletedRunWithTrades();

    expect(vi.mocked(getBacktestTrades).mock.calls[0]).toEqual([RUN_ID, 1, 20]);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(vi.mocked(getBacktestTrades).mock.calls[1]).toEqual([RUN_ID, 2, 20]));
    await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeDefined());
  });

  it("selects a trade row, replaces the selection, and clears it", async () => {
    await renderCompletedRunWithTrades();

    const rows = screen.getAllByRole("row");
    const firstTradeRow = rows[1];
    const secondTradeRow = rows[2];
    if (firstTradeRow === undefined || secondTradeRow === undefined) {
      throw new Error("expected two trade rows");
    }

    fireEvent.click(firstTradeRow);
    await waitFor(() => expect(screen.getByText("Selected trade: 0")).toBeDefined());

    fireEvent.click(secondTradeRow);
    await waitFor(() => expect(screen.getByText("Selected trade: 1")).toBeDefined());

    // Clicking the selected row again deselects it. Without this assertion the
    // test would still pass if the toggle were replaced by a plain assignment.
    fireEvent.click(secondTradeRow);
    await waitFor(() => expect(screen.getByText("Selected trade: null")).toBeDefined());
  });

  it("clears the selection through the Clear selection control", async () => {
    await renderCompletedRunWithTrades();

    const rows = screen.getAllByRole("row");
    const firstTradeRow = rows[1];
    if (firstTradeRow === undefined) {
      throw new Error("expected a trade row");
    }

    fireEvent.click(firstTradeRow);
    await waitFor(() => expect(screen.getByText("Selected trade: 0")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    await waitFor(() => expect(screen.getByText("Selected trade: null")).toBeDefined());
  });

  it("selects a trade on a page other than the first", async () => {
    await renderCompletedRunWithTrades();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));

    const secondPageRow = screen.getAllByRole("row")[1];
    if (secondPageRow === undefined) {
      throw new Error("expected a trade row on page two");
    }
    fireEvent.click(secondPageRow);

    await waitFor(() => expect(screen.getByText("Selected trade: 20")).toBeDefined());
  });
});
