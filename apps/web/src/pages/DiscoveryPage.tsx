// Discovery page: configure and start an automated strategy search, watch its
// progress and the Top-K leaderboard, control the run (pause, resume, cancel),
// and open any entry's result, chart overlays, and provenance.
//
// The page computes nothing itself. Progress counts and the leaderboard come
// from durable state through the injected data source; ranking, evaluation, and
// search logic all live in the backend. The generator selector is fed by the
// catalog, so a new generator appears without any change here.

import {
  API_TIMEFRAMES,
  LEADERBOARD_SORTS,
  type ApiCandle,
  type ApiBacktestTrade,
  type ApiGeneratorDescriptor,
  type ApiLeaderboardEntry,
  type ApiStrategyDescriptor,
  type ApiTimeframe,
  type BacktestResultResponse,
  type BacktestTradesResponse,
  type CreateSearchExperimentRequest,
  type LeaderboardResponse,
  type LeaderboardSort,
  type ProvenanceResponse,
  type SearchProgressResponse,
  type SearchRunStatus,
  type SearchStopConditionsRequest
} from "@crypto-strategy-lab/api-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelSearch,
  createSearchExperiment,
  getBacktestProvenance,
  getBacktestResult,
  getBacktestTrades,
  getCandleHistory,
  getGenerators,
  getStrategies,
  pauseSearch,
  resumeSearch,
  startSearch
} from "../api/client.js";
import { CandlestickChart, type ChartState } from "../components/CandlestickChart.js";
import { formatDateTime } from "../format.js";
import { pollingSearchDataSource, type SearchDataSource } from "./discovery-data-source.js";

const CHART_CANDLE_COUNT = 200;
const TRADE_PAGE_SIZE = 20;

// A default search window, derived the same way the Backtest and Realtime pages
// derive theirs: recent, and aligned to closed candles. A fixed date was used
// here before, which meant the page opened on a range the demo data did not
// cover and the leaderboard stayed empty for a reason nothing on screen
// explained. Defaults only; the operator can search any range they loaded.
const DEFAULT_SEARCH_DAYS = 30;
const DEFAULT_TIMEFRAME_MILLISECONDS = 60 * 60_000;

function defaultSearchWindow(now: number): { startTime: number; endTime: number } {
  const endTime =
    Math.floor(now / DEFAULT_TIMEFRAME_MILLISECONDS) * DEFAULT_TIMEFRAME_MILLISECONDS -
    DEFAULT_TIMEFRAME_MILLISECONDS;
  return { startTime: endTime - DEFAULT_SEARCH_DAYS * 86_400_000, endTime };
}

// A run is still being driven while it is running or converging toward a
// settled control state; polling stops once it settles.
const ACTIVE_STATUSES: readonly SearchRunStatus[] = ["running", "pausing", "cancelling"];
function isActive(status: SearchRunStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

const SPEC_STORAGE_KEY = "discovery.specId";

function readStoredSpecId(): string | null {
  try {
    return window.localStorage.getItem(SPEC_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSpecId(specId: string | null): void {
  try {
    if (specId === null) window.localStorage.removeItem(SPEC_STORAGE_KEY);
    else window.localStorage.setItem(SPEC_STORAGE_KEY, specId);
  } catch {
    // A viewer with storage disabled simply loses refresh recovery.
  }
}

function describeStrategy(entry: ApiLeaderboardEntry): string {
  if (entry.strategy.kind === "single") {
    return `${entry.strategy.id}@${entry.strategy.version}`;
  }
  const components = entry.strategy.composite.components
    .map(component => component.id)
    .join(" + ");
  return `${entry.strategy.composite.name} (${components})`;
}

function formatRatio(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatScore(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function formatPnl(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero"
  }).format(value);
}

function tradePriceReturn(trade: ApiBacktestTrade): number {
  if (trade.entryPrice === 0) return 0;
  const priceChange = trade.exitPrice - trade.entryPrice;
  return trade.direction === "long"
    ? priceChange / trade.entryPrice
    : -priceChange / trade.entryPrice;
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return [days > 0 ? `${days}d` : "", hours > 0 ? `${hours}h` : "", `${minutes}m`]
    .filter(Boolean)
    .join(" ");
}

// The chart backdrop for an opened entry must match the run's own dataset window,
// not the current form state (which a refresh resets). Provenance records that
// window; read it back defensively since the checklist value is untyped.
function candleWindowFromProvenance(
  provenance: ProvenanceResponse
): { readonly timeframe: ApiTimeframe; readonly startTime: number; readonly endTime: number } | null {
  const value = provenance.checklist.dataset?.value as
    | { ref?: { timeframe?: unknown; range?: { startTime?: unknown; endTime?: unknown } } }
    | undefined;
  const ref = value?.ref;
  const timeframe = ref?.timeframe;
  const startTime = ref?.range?.startTime;
  const endTime = ref?.range?.endTime;
  if (
    typeof timeframe === "string" &&
    (API_TIMEFRAMES as readonly string[]).includes(timeframe) &&
    typeof startTime === "number" &&
    typeof endTime === "number"
  ) {
    return { timeframe: timeframe as ApiTimeframe, startTime, endTime };
  }
  return null;
}

export interface DiscoveryPageProps {
  readonly dataSource?: SearchDataSource;
  readonly pollMs?: number;
}

export function DiscoveryPage({
  dataSource = pollingSearchDataSource,
  pollMs = 1500
}: DiscoveryPageProps = {}) {
  const [generators, setGenerators] = useState<readonly ApiGeneratorDescriptor[]>([]);
  const [strategies, setStrategies] = useState<readonly ApiStrategyDescriptor[]>([]);

  const [timeframe, setTimeframe] = useState<ApiTimeframe>("1h");
  const [startTime, setStartTime] = useState(() => defaultSearchWindow(Date.now()).startTime);
  const [endTime, setEndTime] = useState(() => defaultSearchWindow(Date.now()).endTime);
  const [generatorId, setGeneratorId] = useState("");
  const [selectedStrategies, setSelectedStrategies] = useState<readonly string[]>([]);
  const [compositeSize, setCompositeSize] = useState(1);
  const [seed, setSeed] = useState("discovery-demo");
  const [maxCandidates, setMaxCandidates] = useState(20);
  const [maxDurationMs, setMaxDurationMs] = useState(0);
  const [noImprovementIterations, setNoImprovementIterations] = useState(0);
  const [maxInFlight, setMaxInFlight] = useState(2);

  const [specId, setSpecId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SearchProgressResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [sort, setSort] = useState<LeaderboardSort>("rank");
  const [error, setError] = useState<string | null>(null);

  const [selectedEntry, setSelectedEntry] = useState<ApiLeaderboardEntry | null>(null);
  const [detailResult, setDetailResult] = useState<BacktestResultResponse | null>(null);
  const [detailTrades, setDetailTrades] = useState<BacktestTradesResponse | null>(null);
  const [detailTradePage, setDetailTradePage] = useState(1);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [detailProvenance, setDetailProvenance] = useState<ProvenanceResponse | null>(null);
  const [detailCandles, setDetailCandles] = useState<readonly ApiCandle[]>([]);
  const [chartState, setChartState] = useState<ChartState>("loading");

  // Load the generator and strategy catalogs once. Neither is hard-coded here.
  useEffect(() => {
    void getGenerators()
      .then((response) => {
        setGenerators(response.generators);
        setGeneratorId((current) => current || (response.generators[0]?.id ?? ""));
      })
      .catch(() => setGenerators([]));
    void getStrategies()
      .then((response) => {
        setStrategies(response.strategies);
        setSelectedStrategies((current) =>
          current.length > 0 ? current : response.strategies.slice(0, 1).map((s) => s.id)
        );
      })
      .catch(() => setStrategies([]));
  }, []);

  const refreshSnapshot = useCallback(
    async (id: string, nextSort: LeaderboardSort) => {
      const [nextProgress, nextLeaderboard] = await Promise.all([
        dataSource.getProgress(id),
        dataSource.getLeaderboard(id, nextSort)
      ]);
      setProgress(nextProgress);
      setLeaderboard(nextLeaderboard);
      return nextProgress;
    },
    [dataSource]
  );

  // Restore the last run on mount so a refresh returns to the correct view.
  useEffect(() => {
    const stored = readStoredSpecId();
    if (stored !== null) {
      setSpecId(stored);
      void refreshSnapshot(stored, sort).catch(() => setError("Could not restore the last run."));
    }
    // Runs only on mount; a later render must not re-restore from storage.
  }, []);

  // Poll progress and the leaderboard while the run is active.
  const pollRef = useRef<SearchDataSource>(dataSource);
  pollRef.current = dataSource;
  useEffect(() => {
    if (specId === null || progress === null || !isActive(progress.status)) return;
    const timer = setTimeout(() => {
      void refreshSnapshot(specId, sort).catch(() => undefined);
    }, pollMs);
    return () => clearTimeout(timer);
  }, [specId, progress, sort, pollMs, refreshSnapshot]);

  async function handleStart(): Promise<void> {
    setError(null);
    setLeaderboard(null);
    setSelectedEntry(null);
    const generator = generators.find((g) => g.id === generatorId);
    // Only the stop conditions the operator actually set are sent; the backend
    // requires at least one (the candidate limit defaults to a non-zero value).
    const stopConditions: SearchStopConditionsRequest = {
      ...(maxCandidates > 0 ? { maxCandidates } : {}),
      ...(maxDurationMs > 0 ? { maxDurationMs } : {}),
      ...(noImprovementIterations > 0 ? { noImprovementIterations } : {})
    };
    const request: CreateSearchExperimentRequest = {
      dataset: { provider: "binance", symbol: "BTCUSDT", timeframe, startTime, endTime },
      generator: { id: generatorId, version: generator?.version ?? "1.0.0", configuration: {} },
      searchSpace: {
        strategies: selectedStrategies.map((id) => ({
          id,
          version: strategies.find((s) => s.id === id)?.version ?? "1.0.0"
        })),
        compositeSizes: [compositeSize],
        policies: compositeSize > 1 ? [{ id: "majority-vote", version: "1.0.0" }] : []
      },
      seed,
      stopConditions,
      maxInFlight
    };
    try {
      const { specId: newSpecId } = await createSearchExperiment(request);
      const firstProgress = await startSearch(newSpecId);
      setSpecId(newSpecId);
      storeSpecId(newSpecId);
      setProgress(firstProgress);
      await refreshSnapshot(newSpecId, sort);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the search.");
    }
  }

  async function handleControl(
    action: (id: string) => Promise<SearchProgressResponse>
  ): Promise<void> {
    if (specId === null) return;
    try {
      // The endpoint returns the converged snapshot; the page shows that, never
      // an optimistic requested state.
      setProgress(await action(specId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Control action failed.");
    }
  }

  async function handleSortChange(nextSort: LeaderboardSort): Promise<void> {
    setSort(nextSort);
    if (specId !== null) {
      try {
        setLeaderboard(await dataSource.getLeaderboard(specId, nextSort));
      } catch {
        // Leave the current leaderboard in place on a transient read failure.
      }
    }
  }

  async function openEntry(entry: ApiLeaderboardEntry): Promise<void> {
    setSelectedEntry(entry);
    setDetailResult(null);
    setDetailTrades(null);
    setDetailProvenance(null);
    setDetailCandles([]);
    setDetailTradePage(1);
    setSelectedTradeId(null);
    setChartState("loading");
    try {
      const [result, trades, provenance] = await Promise.all([
        getBacktestResult(entry.runId),
        getBacktestTrades(entry.runId, 1, TRADE_PAGE_SIZE),
        getBacktestProvenance(entry.runId)
      ]);
      setDetailResult(result);
      setDetailTrades(trades);
      setDetailProvenance(provenance);
      // Draw the chart over the run's own dataset window, not the current form.
      const window = candleWindowFromProvenance(provenance);
      const candleHistory = window
        ? await getCandleHistory({
            provider: "binance",
            symbol: "BTCUSDT",
            timeframe: window.timeframe,
            startTime: window.startTime,
            endTime: window.endTime
          }).catch(() => ({ candles: [] as readonly ApiCandle[] }))
        : { candles: [] as readonly ApiCandle[] };
      setDetailCandles(candleHistory.candles.slice(-CHART_CANDLE_COUNT));
      setChartState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the entry.");
      setChartState("error");
    }
  }

  async function showDetailTradePage(pageNumber: number): Promise<void> {
    if (selectedEntry === null) return;
    try {
      const response = await getBacktestTrades(
        selectedEntry.runId,
        pageNumber,
        TRADE_PAGE_SIZE
      );
      setDetailTrades(response);
      setDetailTradePage(pageNumber);
      setSelectedTradeId(null);
    } catch (pageError: unknown) {
      setError(pageError instanceof Error ? pageError.message : "Could not load trades.");
    }
  }

  const status = progress?.status;
  const canPause = status === "running";
  // The backend supports withdrawing a pause request while in-flight work is
  // still draining, as well as resuming after the run has fully paused.
  const canResume = status === "pausing" || status === "paused";
  const canCancel = status !== undefined && status !== "cancelled" && status !== "stopped";
  const entries = leaderboard?.entries ?? [];
  const detailAnnotations =
    detailResult?.status === "completed" ? detailResult.annotations : [];
  const detailTradeRows =
    detailTrades && "trades" in detailTrades ? detailTrades.trades : [];
  const detailTradeTotal = detailTrades && "trades" in detailTrades
    ? detailTrades.page.totalCount
    : 0;
  const detailTradePageCount = Math.max(1, Math.ceil(detailTradeTotal / TRADE_PAGE_SIZE));
  const selectedTrade = detailTradeRows.find(
    (trade) => trade.sequenceNumber === selectedTradeId
  );
  const selectedSingleStrategy = selectedEntry?.strategy.kind === "single"
    ? selectedEntry.strategy
    : undefined;
  const selectedDescriptor = selectedSingleStrategy !== undefined
    ? strategies.find((descriptor) =>
        descriptor.id === selectedSingleStrategy.id &&
        descriptor.version === selectedSingleStrategy.version)
    : undefined;

  return (
    <section className="discovery-page">
      <div className="page-heading">
        <h1>Discovery</h1>
        <p>Generate candidate strategies, backtest them in a controlled loop, and rank the best.</p>
      </div>

      <div className="configuration-panel">
        <label>
          <span>Timeframe</span>
          <select
            aria-label="Timeframe"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as ApiTimeframe)}
          >
            {API_TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Start time (ms)</span>
          <input
            aria-label="Start time"
            type="number"
            value={startTime}
            onChange={(e) => setStartTime(Number(e.target.value))}
          />
        </label>
        <label>
          <span>End time (ms)</span>
          <input
            aria-label="End time"
            type="number"
            value={endTime}
            onChange={(e) => setEndTime(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Search method</span>
          <select
            aria-label="Search method"
            value={generatorId}
            onChange={(e) => setGeneratorId(e.target.value)}
          >
            {generators.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <fieldset className="search-space">
          <legend>Search space</legend>
          {strategies.map((s) => (
            <label key={s.id} className="strategy-option">
              <input
                type="checkbox"
                aria-label={s.name}
                checked={selectedStrategies.includes(s.id)}
                onChange={(e) =>
                  setSelectedStrategies((current) =>
                    e.target.checked
                      ? [...current, s.id]
                      : current.filter((id) => id !== s.id)
                  )
                }
              />
              <span>{s.name}</span>
            </label>
          ))}
        </fieldset>
        <label>
          <span>Composite size</span>
          <input
            aria-label="Composite size"
            type="number"
            min={1}
            value={compositeSize}
            onChange={(e) => setCompositeSize(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <label>
          <span>Seed</span>
          <input aria-label="Seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <label>
          <span>Candidate limit</span>
          <input
            aria-label="Candidate limit"
            type="number"
            value={maxCandidates}
            onChange={(e) => setMaxCandidates(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Duration limit (ms, 0 = off)</span>
          <input
            aria-label="Duration limit"
            type="number"
            value={maxDurationMs}
            onChange={(e) => setMaxDurationMs(Number(e.target.value))}
          />
        </label>
        <label>
          <span>No-improvement stop (0 = off)</span>
          <input
            aria-label="No-improvement stop"
            type="number"
            value={noImprovementIterations}
            onChange={(e) => setNoImprovementIterations(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Max in flight</span>
          <input
            aria-label="Max in flight"
            type="number"
            value={maxInFlight}
            onChange={(e) => setMaxInFlight(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() => void handleStart()}
          disabled={selectedStrategies.length === 0 || generatorId === ""}
        >
          Start Search
        </button>
      </div>

      {error !== null && <p className="error" role="alert">{error}</p>}

      {progress !== null && (
        <div className="progress-panel">
          <h2>Status: {progress.status}</h2>
          {progress.stopReason !== null && <p>Stopped: {progress.stopReason}</p>}
          <ul className="progress-counts">
            <li>Generated: {progress.generated}</li>
            <li>Submitted: {progress.submitted}</li>
            <li>Completed: {progress.completed}</li>
            <li>Failed: {progress.failed}</li>
            <li>Cancelled: {progress.cancelled}</li>
            <li>In flight: {progress.inFlight}</li>
          </ul>
          <div className="controls">
            <button onClick={() => void handleControl(pauseSearch)} disabled={!canPause}>Pause</button>
            <button onClick={() => void handleControl(resumeSearch)} disabled={!canResume}>Resume</button>
            <button onClick={() => void handleControl(cancelSearch)} disabled={!canCancel}>Cancel</button>
          </div>
        </div>
      )}

      {leaderboard !== null && (
        <div className="leaderboard-panel">
          <div className="leaderboard-heading">
            <div>
              <h2>Leaderboard</h2>
              <p>Click a candidate to inspect its chart, trades, metrics, and provenance.</p>
            </div>
            <label>
              <span>Sort by</span>
              <select
                aria-label="Sort by"
                value={sort}
                onChange={(e) => void handleSortChange(e.target.value as LeaderboardSort)}
              >
                {LEADERBOARD_SORTS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          {entries.length === 0 ? (
            <p>No ranked candidates yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Strategy</th>
                  <th>Total Return</th>
                  <th>Win Rate</th>
                  <th>Max Drawdown</th>
                  <th>Trades</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.runId}
                    onClick={() => void openEntry(entry)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openEntry(entry);
                      }
                    }}
                    className={`leaderboard-row${selectedEntry?.runId === entry.runId ? " selected" : ""}`}
                    tabIndex={0}
                    aria-selected={selectedEntry?.runId === entry.runId}
                  >
                    <td>{entry.rank}</td>
                    <td>{describeStrategy(entry)}</td>
                    <td>{formatRatio(entry.metrics.totalReturn)}</td>
                    <td>{formatRatio(entry.metrics.winRate)}</td>
                    <td>{formatRatio(entry.metrics.maximumDrawdown)}</td>
                    <td>{entry.metrics.numberOfTrades}</td>
                    <td>{formatScore(entry.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedEntry !== null && (
        <div className="entry-detail">
          <div className="entry-detail-heading">
            <div>
              <span className="entry-rank">Rank #{selectedEntry.rank}</span>
              <h2>{describeStrategy(selectedEntry)}</h2>
              <p>Backtest run {selectedEntry.runId}</p>
            </div>
            <div className="entry-metrics" aria-label="Selected candidate metrics">
              <div><span>Total return</span><strong>{formatRatio(selectedEntry.metrics.totalReturn)}</strong></div>
              <div><span>Win rate</span><strong>{formatRatio(selectedEntry.metrics.winRate)}</strong></div>
              <div><span>Max drawdown</span><strong>{formatRatio(selectedEntry.metrics.maximumDrawdown)}</strong></div>
              <div><span>Trades</span><strong>{selectedEntry.metrics.numberOfTrades}</strong></div>
              <div><span>Score</span><strong>{formatScore(selectedEntry.score)}</strong></div>
            </div>
          </div>
          <section className="strategy-detail-card" aria-label="Selected strategy details">
            <div className="strategy-detail-summary">
              <div>
                <span>Strategy</span>
                <strong>
                  {selectedEntry.strategy.kind === "single"
                    ? selectedDescriptor?.name ?? selectedEntry.strategy.id
                    : selectedEntry.strategy.composite.name}
                </strong>
              </div>
              <div>
                <span>Version</span>
                <strong>
                  {selectedEntry.strategy.kind === "single"
                    ? selectedEntry.strategy.version
                    : selectedEntry.strategy.composite.version}
                </strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{selectedEntry.strategy.kind === "single" ? "Single strategy" : "Composite"}</strong>
              </div>
              <div>
                <span>Ranking score</span>
                <strong>{formatScore(selectedEntry.score)}</strong>
              </div>
            </div>
            <p className="strategy-detail-description">
              {selectedEntry.strategy.kind === "single"
                ? selectedDescriptor?.description || "No catalog description is available."
                : selectedEntry.strategy.composite.description || "No composite description is available."}
            </p>
            {selectedEntry.strategy.kind === "single" ? (
              <div>
                <h3>Parameters</h3>
                {Object.keys(selectedEntry.strategy.parameters).length === 0 ? (
                  <p className="strategy-detail-empty">No runtime parameters.</p>
                ) : (
                  <dl className="strategy-parameter-list">
                    {Object.entries(selectedEntry.strategy.parameters).map(([key, value]) => (
                      <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
                    ))}
                  </dl>
                )}
              </div>
            ) : (
              <div>
                <h3>Components and parameters</h3>
                <div className="strategy-component-list">
                  {selectedEntry.strategy.composite.components.map((component) => (
                    <div key={`${component.id}@${component.version}`}>
                      <strong>{component.id}@{component.version}</strong>
                      <span>
                        {Object.entries(component.parameters).length > 0
                          ? Object.entries(component.parameters)
                              .map(([key, value]) => `${key}=${String(value)}`)
                              .join(", ")
                          : "No runtime parameters"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="strategy-policy">
                  Policy: {selectedEntry.strategy.composite.policy.id}@{selectedEntry.strategy.composite.policy.version}
                </p>
              </div>
            )}
          </section>
          <div className="chart-card">
            <CandlestickChart
              state={chartState}
              candles={detailCandles}
              annotations={detailAnnotations}
              trades={detailTradeRows}
              selectedTradeId={selectedTradeId}
            />
          </div>
          <div className="detail-trades">
            <h3>Trades</h3>
            {detailTradeRows.length === 0 ? (
              <p>No trades for this candidate.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Direction</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {detailTradeRows.map((trade) => (
                    <tr
                      key={trade.sequenceNumber}
                      className={`trade-row${selectedTradeId === trade.sequenceNumber ? " selected" : ""}`}
                      aria-selected={selectedTradeId === trade.sequenceNumber}
                      tabIndex={0}
                      onClick={() => setSelectedTradeId(trade.sequenceNumber)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedTradeId(trade.sequenceNumber);
                        }
                      }}
                    >
                      <td>{formatDateTime(trade.entryTime)} UTC</td>
                      <td>{formatDateTime(trade.exitTime)} UTC</td>
                      <td>{trade.direction}</td>
                      <td className={trade.profitAndLoss >= 0 ? "positive-value" : "negative-value"}>
                        {formatPnl(trade.profitAndLoss)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {selectedTrade !== undefined && (
              <section className="selected-trade-card" aria-label="Selected trade details">
                <div className="selected-trade-heading">
                  <div>
                    <span>Selected trade</span>
                    <strong>#{selectedTrade.sequenceNumber + 1} · {selectedTrade.direction.toUpperCase()}</strong>
                  </div>
                  <button type="button" onClick={() => setSelectedTradeId(null)}>Clear selection</button>
                </div>
                <div className="selected-trade-grid">
                  <div><span>Entry</span><strong>{formatDateTime(selectedTrade.entryTime)} UTC</strong></div>
                  <div><span>Entry price</span><strong>{selectedTrade.entryPrice}</strong></div>
                  <div><span>Exit</span><strong>{formatDateTime(selectedTrade.exitTime)} UTC</strong></div>
                  <div><span>Exit price</span><strong>{selectedTrade.exitPrice}</strong></div>
                  <div><span>Gross price return</span><strong>{formatRatio(tradePriceReturn(selectedTrade))}</strong></div>
                  <div><span>Net PnL</span><strong>{formatPnl(selectedTrade.profitAndLoss)}</strong></div>
                  <div><span>Quantity</span><strong>{selectedTrade.quantity}</strong></div>
                  <div><span>Duration</span><strong>{formatDuration(selectedTrade.exitTime - selectedTrade.entryTime)}</strong></div>
                  <div><span>Entry fee</span><strong>{selectedTrade.entryFee}</strong></div>
                  <div><span>Exit fee</span><strong>{selectedTrade.exitFee}</strong></div>
                  <div><span>Slippage</span><strong>{selectedTrade.slippage}</strong></div>
                  <div><span>Exit reason</span><strong>{selectedTrade.exitReason}</strong></div>
                </div>
                <p>Candidate-level Return, Win Rate, Max Drawdown and Number of Trades remain in the metrics summary above.</p>
              </section>
            )}
            {detailTradeTotal > TRADE_PAGE_SIZE && (
              <div className="news-pagination">
                <button
                  type="button"
                  disabled={detailTradePage === 1}
                  onClick={() => void showDetailTradePage(detailTradePage - 1)}
                >
                  Previous page
                </button>
                <span>Page {detailTradePage} of {detailTradePageCount}</span>
                <button
                  type="button"
                  disabled={detailTradePage >= detailTradePageCount}
                  onClick={() => void showDetailTradePage(detailTradePage + 1)}
                >
                  Next page
                </button>
              </div>
            )}
          </div>
          {detailProvenance !== null && (
            <div className="detail-provenance">
              <h3>Provenance</h3>
              <ul>
                {Object.entries(detailProvenance.checklist).map(([key, item]) => (
                  <li key={key}>
                    {key}: {item.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
