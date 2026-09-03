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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  fromDateInputValue,
  toDateInputValue
} from "../format.js";

const CHART_CANDLE_COUNT = 200;

// A dataset window is addressed by candle open times, so a bound chosen on a
// calendar day is snapped back to the open time that contains it. The Backtest
// page does the same; without it the backend refuses an unaligned bound.
const TIMEFRAME_MILLISECONDS: Readonly<Record<ApiTimeframe, number>> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "1d": 86_400_000
};

function alignToCandleOpen(epochMs: number, timeframe: ApiTimeframe): number {
  const duration = TIMEFRAME_MILLISECONDS[timeframe];
  return Math.floor(epochMs / duration) * duration;
}

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

// A leaderboard row has to be told apart from its neighbours at a glance. A
// random search returns many candidates of the same strategy with different
// parameters, so the identifier alone repeats: four rows all reading
// "moving-average@1.0.0". The catalog already carries a readable name and a
// label for every parameter, so a row shows the name first and the parameter
// values that actually differ underneath. The exact identifier and version stay
// on the cell's title attribute, so traceability is not lost.
interface StrategyLabel {
  readonly title: string;
  readonly detail: string;
  readonly reference: string;
}

type StrategyCatalog = ReadonlyMap<string, ApiStrategyDescriptor>;

function describeParameters(
  parameters: Record<string, unknown>,
  descriptor: ApiStrategyDescriptor | undefined
): string {
  return Object.entries(parameters)
    .map(([key, value]) => {
      const label = descriptor?.parameterSchema.properties[key]?.label ?? key;
      return `${label}: ${String(value)}`;
    })
    .join("  ·  ");
}

function describeStrategy(entry: ApiLeaderboardEntry, catalog: StrategyCatalog): StrategyLabel {
  if (entry.strategy.kind === "single") {
    const descriptor = catalog.get(entry.strategy.id);
    return {
      title: descriptor?.name ?? entry.strategy.id,
      detail: describeParameters(entry.strategy.parameters, descriptor),
      reference: `${entry.strategy.id}@${entry.strategy.version}`
    };
  }
  // A generated composite is already named after its parts by the backend
  // ("Composite of rsi + moving-average"). That name stays first, because it is
  // also the name an operator gave a composite they saved themselves; the line
  // below spells the same parts out in catalog words.
  const composite = entry.strategy.composite;
  const parts = composite.components
    .map((component) => catalog.get(component.id)?.name ?? component.id)
    .join(" + ");
  const policy = composite.policy.id.replace(/-/g, " ");
  return {
    title: composite.name,
    detail: `${parts}  ·  ${policy}`,
    reference: `${composite.id}@${composite.version}`
  };
}

// The sort control offered the raw contract values ("maximumDrawdown"). It now
// shows the same words the table headers use.
const SORT_LABELS: Readonly<Record<LeaderboardSort, string>> = {
  rank: "Rank",
  totalReturn: "Total return",
  winRate: "Win rate",
  maximumDrawdown: "Max drawdown",
  numberOfTrades: "Trades"
};

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
      void refreshSnapshot(stored, sort).catch(() => {
        // The stored run is simply not there any more - a reset database, a
        // pruned experiment, another machine. That is an absence, not a
        // failure, so the page forgets it and opens on its normal empty state
        // instead of showing the operator an alarming error they cannot act on.
        setSpecId(null);
        storeSpecId(null);
      });
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

  // The chosen window survives a timeframe change; only its resolution changes.
  function handleTimeframeChange(next: ApiTimeframe): void {
    setTimeframe(next);
    setStartTime((current) => alignToCandleOpen(current, next));
    setEndTime((current) => alignToCandleOpen(current, next));
  }

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
  // The catalog is already loaded for the strategy pool. Indexing it by id lets
  // the leaderboard write a candidate in the same words the pool uses.
  const catalogById = useMemo(
    () => new Map(strategies.map((descriptor) => [descriptor.id, descriptor])),
    [strategies]
  );
  const detailAnnotations =
    detailResult?.status === "completed" ? detailResult.annotations : [];
  const detailTradeRows =
    detailTrades && "trades" in detailTrades ? detailTrades.trades : [];

  return (
    <section className="discovery-page">
      <div className="page-heading">
        <div>
          <h1>Discovery</h1>
          <p>Automatically generate, backtest, and rank candidate strategies.</p>
        </div>
      </div>

      <div className="stacked-sections">
        <section className="panel" aria-labelledby="search-setup-heading">
          <header className="panel-header">
            <div>
              <h2 id="search-setup-heading">Search configuration</h2>
              <p>Choose the market window, the search method, the strategy pool, and the limits</p>
            </div>
          </header>
          <div className="panel-body">
            <section className="form-section">
              <h3 className="section-title"><span className="step">1</span> Search setup</h3>
              <div className="field-grid field-grid-3">
                <label className="field">
                  <span className="field-label">Timeframe</span>
                  <select
                    aria-label="Timeframe"
                    value={timeframe}
                    onChange={(e) => handleTimeframeChange(e.target.value as ApiTimeframe)}
                  >
                    {API_TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>{tf}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Search method</span>
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
                <label className="field">
                  <span className="field-label">Start date</span>
                  <input
                    aria-label="Start date"
                    type="date"
                    value={toDateInputValue(startTime)}
                    onChange={(e) => {
                      const parsed = fromDateInputValue(e.target.value, "start");
                      if (parsed !== null) setStartTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">End date</span>
                  <input
                    aria-label="End date"
                    type="date"
                    value={toDateInputValue(endTime)}
                    onChange={(e) => {
                      const parsed = fromDateInputValue(e.target.value, "end");
                      if (parsed !== null) setEndTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Composite size</span>
                  <input
                    aria-label="Composite size"
                    type="number"
                    min={1}
                    value={compositeSize}
                    onChange={(e) => setCompositeSize(Math.max(1, Number(e.target.value)))}
                  />
                  <span className="field-hint">
                    {compositeSize > 1
                      ? `Each candidate combines ${compositeSize} strategies by majority vote.`
                      : "Each candidate is a single strategy."}
                  </span>
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3 className="section-title">
                <span className="step">2</span> Strategy pool
                <span className="section-count">{selectedStrategies.length}</span>
              </h3>
              <p className="section-note">
                The search draws candidates from the strategies checked here.
              </p>
              <fieldset className="strategy-pool">
                {strategies.map((s) => {
                  const checked = selectedStrategies.includes(s.id);
                  return (
                    <label key={s.id} className={checked ? "pool-option is-checked" : "pool-option"}>
                      <input
                        type="checkbox"
                        aria-label={s.name}
                        checked={checked}
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
                  );
                })}
              </fieldset>
            </section>

            <section className="form-section">
              <h3 className="section-title"><span className="step">3</span> Run limits</h3>
              <div className="field-grid field-grid-3">
                <label className="field">
                  <span className="field-label">Candidate limit</span>
                  <input
                    aria-label="Candidate limit"
                    type="number"
                    value={maxCandidates}
                    onChange={(e) => setMaxCandidates(Number(e.target.value))}
                  />
                  <span className="field-hint">Stop after this many candidates.</span>
                </label>
                <label className="field">
                  <span className="field-label">Max in flight</span>
                  <input
                    aria-label="Max in flight"
                    type="number"
                    value={maxInFlight}
                    onChange={(e) => setMaxInFlight(Number(e.target.value))}
                  />
                  <span className="field-hint">Backtests running at the same time.</span>
                </label>
                <label className="field">
                  <span className="field-label">Seed</span>
                  <input aria-label="Seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
                  <span className="field-hint">Same seed, same candidates.</span>
                </label>
                <label className="field">
                  <span className="field-label">Time limit (minutes)</span>
                  <input
                    aria-label="Time limit"
                    type="number"
                    min={0}
                    value={maxDurationMs === 0 ? 0 : maxDurationMs / 60_000}
                    onChange={(e) =>
                      setMaxDurationMs(Math.max(0, Number(e.target.value)) * 60_000)
                    }
                  />
                  <span className="field-hint">0 means no time limit.</span>
                </label>
                <label className="field">
                  <span className="field-label">No-improvement stop</span>
                  <input
                    aria-label="No-improvement stop"
                    type="number"
                    min={0}
                    value={noImprovementIterations}
                    onChange={(e) => setNoImprovementIterations(Number(e.target.value))}
                  />
                  <span className="field-hint">0 means never stop early.</span>
                </label>
              </div>
            </section>

            <div className="run-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => void handleStart()}
                disabled={selectedStrategies.length === 0 || generatorId === ""}
              >
                Start Search
              </button>
              {selectedStrategies.length === 0 && (
                <span className="hint">Check at least one strategy to start a search.</span>
              )}
              {selectedStrategies.length > 0 && compositeSize > selectedStrategies.length && (
                <span className="hint">
                  Check at least {compositeSize} strategies to fill a composite of this size.
                </span>
              )}
            </div>

            {error !== null && <p className="banner banner-error" role="alert">{error}</p>}
          </div>
        </section>

        {progress !== null && (
          <section className="panel" aria-labelledby="progress-heading">
            <header className="panel-header">
              <div>
                <h2 id="progress-heading">Search progress</h2>
                <p>Live counts from the running experiment</p>
              </div>
              <div className="status-line">
                <span className="status-chip" data-status={progress.status}>
                  Status: {progress.status}
                </span>
                {progress.stopReason !== null && (
                  <span className="hint">Stopped: {progress.stopReason}</span>
                )}
              </div>
            </header>
            <div className="panel-body">
              <ul className="progress-counts">
                {[
                  ["Generated", progress.generated],
                  ["Submitted", progress.submitted],
                  ["Completed", progress.completed],
                  ["Failed", progress.failed],
                  ["Cancelled", progress.cancelled],
                  ["In flight", progress.inFlight]
                ].map(([label, value]) => (
                  <li key={String(label)} className="progress-count">
                    <span className="progress-count-label">{label}</span>
                    <span className="progress-count-value">{value}</span>
                  </li>
                ))}
              </ul>
              <div className="control-row">
                <button type="button" onClick={() => void handleControl(pauseSearch)} disabled={!canPause}>Pause</button>
                <button type="button" onClick={() => void handleControl(resumeSearch)} disabled={!canResume}>Resume</button>
                <button type="button" onClick={() => void handleControl(cancelSearch)} disabled={!canCancel}>Cancel</button>
              </div>
            </div>
          </section>
        )}

        {leaderboard !== null && (
          <section className="panel" aria-labelledby="leaderboard-heading">
            <header className="panel-header">
              <div>
                <h2 id="leaderboard-heading">Leaderboard</h2>
                <p>Best candidates found so far. Select a row to open its result.</p>
              </div>
              <label className="field">
                <span className="field-label">Sort by</span>
                <select
                  aria-label="Sort by"
                  value={sort}
                  onChange={(e) => void handleSortChange(e.target.value as LeaderboardSort)}
                >
                  {LEADERBOARD_SORTS.map((option) => (
                    <option key={option} value={option}>{SORT_LABELS[option]}</option>
                  ))}
                </select>
              </label>
            </header>
            <div className="panel-body">
              {entries.length === 0 ? (
                <p className="empty-state">No ranked candidates yet.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Strategy</th>
                        <th className="numeric">Total return</th>
                        <th className="numeric">Win rate</th>
                        <th className="numeric">Max drawdown</th>
                        <th className="numeric">Trades</th>
                        <th className="numeric">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr
                          key={entry.runId}
                          onClick={() => void openEntry(entry)}
                          aria-selected={selectedEntry?.runId === entry.runId}
                          className={
                            selectedEntry?.runId === entry.runId ? "clickable selected" : "clickable"
                          }
                        >
                          <td className="rank-cell">{entry.rank}</td>
                          <td className="strategy-cell">
                            {(() => {
                              const label = describeStrategy(entry, catalogById);
                              return (
                                <span className="strategy-label" title={label.reference}>
                                  <span className="strategy-title">{label.title}</span>
                                  {label.detail !== "" && (
                                    <span className="strategy-detail">{label.detail}</span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>
                          <td
                            className={
                              entry.metrics.totalReturn < 0
                                ? "numeric value-negative"
                                : "numeric value-positive"
                            }
                          >
                            {formatPercent(entry.metrics.totalReturn)}
                          </td>
                          <td className="numeric">{formatPercent(entry.metrics.winRate)}</td>
                          <td className="numeric">{formatPercent(entry.metrics.maximumDrawdown)}</td>
                          <td className="numeric">{entry.metrics.numberOfTrades}</td>
                          <td className="numeric">{formatNumber(entry.score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {selectedEntry !== null && (
          <section className="panel" aria-labelledby="entry-detail-heading">
            <header className="panel-header">
              <div>
                <h2 id="entry-detail-heading">
                  Rank {selectedEntry.rank}: {describeStrategy(selectedEntry, catalogById).title}
                </h2>
                <p>{describeStrategy(selectedEntry, catalogById).detail}</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="chart-card">
                <CandlestickChart
                  state={chartState}
                  candles={detailCandles}
                  annotations={detailAnnotations}
                  trades={detailTradeRows}
                  selectedTradeId={null}
                />
              </div>

              <section className="form-section">
                <h3 className="subsection-title">Trades</h3>
                {detailTradeRows.length === 0 ? (
                  <p className="empty-state">No trades for this candidate.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Entry</th>
                          <th>Exit</th>
                          <th>Direction</th>
                          <th className="numeric">PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailTradeRows.map((trade) => (
                          <tr key={trade.sequenceNumber}>
                            <td>{formatDateTime(trade.entryTime)}</td>
                            <td>{formatDateTime(trade.exitTime)}</td>
                            <td>
                              <span className={`direction-${trade.direction}`}>{trade.direction}</span>
                            </td>
                            <td
                              className={
                                trade.profitAndLoss < 0
                                  ? "numeric value-negative"
                                  : "numeric value-positive"
                              }
                            >
                              {formatMoney(trade.profitAndLoss)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {detailProvenance !== null && (
                <details className="provenance">
                  <summary>Run provenance</summary>
                  <ul className="provenance-list">
                    {Object.entries(detailProvenance.checklist).map(([key, item]) => (
                      <li key={key}>
                        {key}: {item.status}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
