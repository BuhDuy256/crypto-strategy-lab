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
import { pollingSearchDataSource, type SearchDataSource } from "./discovery-data-source.js";

const CHART_CANDLE_COUNT = 200;

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
  return `${entry.strategy.composite.name} (composite)`;
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
    setChartState("loading");
    try {
      const [result, trades, provenance] = await Promise.all([
        getBacktestResult(entry.runId),
        getBacktestTrades(entry.runId, 1, 20),
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

  const status = progress?.status;
  const canPause = status === "running";
  const canResume = status === "paused";
  const canCancel = status !== undefined && status !== "cancelled" && status !== "stopped";
  const entries = leaderboard?.entries ?? [];
  const detailAnnotations =
    detailResult?.status === "completed" ? detailResult.annotations : [];
  const detailTradeRows =
    detailTrades && "trades" in detailTrades ? detailTrades.trades : [];

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
            <h2>Leaderboard</h2>
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
                    className={selectedEntry?.runId === entry.runId ? "selected" : ""}
                  >
                    <td>{entry.rank}</td>
                    <td>{describeStrategy(entry)}</td>
                    <td>{entry.metrics.totalReturn}</td>
                    <td>{entry.metrics.winRate}</td>
                    <td>{entry.metrics.maximumDrawdown}</td>
                    <td>{entry.metrics.numberOfTrades}</td>
                    <td>{entry.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedEntry !== null && (
        <div className="entry-detail">
          <h2>Entry detail: rank {selectedEntry.rank}</h2>
          <div className="chart-card">
            <CandlestickChart
              state={chartState}
              candles={detailCandles}
              annotations={detailAnnotations}
              trades={detailTradeRows}
              selectedTradeId={null}
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
                    <tr key={trade.sequenceNumber}>
                      <td>{new Date(trade.entryTime).toISOString()}</td>
                      <td>{new Date(trade.exitTime).toISOString()}</td>
                      <td>{trade.direction}</td>
                      <td>{trade.profitAndLoss}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
