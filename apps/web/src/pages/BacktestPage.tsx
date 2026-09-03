// The Backtest page (UI-04) plus trade-row selection and chart highlight (UI-06).
//
// The page holds no strategy, backtest, evaluation, or ranking logic. It only
// collects user choices - the dataset window, the strategy, and its parameters -
// and posts them. The backend resolves the dataset manifest, supplies the
// execution profile and the metric set, stamps provenance, and computes every
// number shown here. The strategy list and its parameter form come from the
// strategy catalog endpoint, so no strategy identifier is written in this file.

import {
  API_TIMEFRAMES,
  type ApiCandle,
  type ApiParameterSchema,
  type ApiStrategyDescriptor,
  type ApiStrategyParameters,
  type ApiStrategyParameterValue,
  type ApiTimeframe,
  type BacktestRunResponse,
  type BacktestResultResponse,
  type BacktestTradePageResponse,
  type BacktestTradesResponse,
  type CandleHistoryRequest,
  type CompletedBacktestResultResponse
} from "@crypto-strategy-lab/api-contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { CandlestickChart, type ChartState } from "../components/CandlestickChart.js";
import { GenericParameterForm } from "../components/GenericParameterForm.js";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  fromDateInputValue,
  toDateInputValue,
  truncateHash
} from "../format.js";

const CANDLE_COUNT = 200;
const TRADE_PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 2_000;
const SYMBOLS = ["BTCUSDT"] as const;
type Symbol = (typeof SYMBOLS)[number];
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

interface TimeRange {
  readonly startTime: number;
  readonly endTime: number;
}

export function buildRecentCandleRequest(
  timeframe: ApiTimeframe,
  now: number
): CandleHistoryRequest {
  const duration = TIMEFRAME_MILLISECONDS[timeframe];
  const currentOpenTime = Math.floor(now / duration) * duration;
  const endTime = currentOpenTime - duration;
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe,
    startTime: endTime - (CANDLE_COUNT - 1) * duration,
    endTime
  };
}

function recentRange(timeframe: ApiTimeframe, now: number): TimeRange {
  const request = buildRecentCandleRequest(timeframe, now);
  return { startTime: request.startTime, endTime: request.endTime };
}

// Snaps a chosen instant back to the candle open time that contains it. A dataset
// window is addressed by candle open times, so an unaligned bound is rejected by
// the backend; this keeps a calendar-day choice expressible for every timeframe.
function alignToCandleOpen(epochMs: number, timeframe: ApiTimeframe): number {
  const duration = TIMEFRAME_MILLISECONDS[timeframe];
  return Math.floor(epochMs / duration) * duration;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function completedResult(
  result: BacktestResultResponse | null
): CompletedBacktestResultResponse | null {
  return result !== null && result.status === "completed" ? result : null;
}

function tradePage(
  trades: BacktestTradesResponse | null
): BacktestTradePageResponse | null {
  return trades !== null && trades.status === "completed" ? trades : null;
}

// Keeps only the parameters the selected strategy's schema declares.
//
// The shared parameter form fills its schema defaults by calling back up, so
// right after a strategy switch a value belonging to the previously selected
// schema can still arrive. Scoping the collected values to the current schema
// means the request always describes the strategy actually selected.
function parametersForSchema(
  schema: ApiParameterSchema | undefined,
  values: ApiStrategyParameters
): ApiStrategyParameters {
  if (schema === undefined) return {};
  const scoped: Record<string, ApiStrategyParameterValue> = {};
  for (const name of Object.keys(schema.properties)) {
    const value = values[name];
    if (value !== undefined) scoped[name] = value;
  }
  return scoped;
}

export function BacktestPage() {
  const [symbol, setSymbol] = useState<Symbol>("BTCUSDT");
  const [timeframe, setTimeframe] = useState<ApiTimeframe>("1h");
  const [range, setRange] = useState<TimeRange>(() => recentRange("1h", Date.now()));
  const [candles, setCandles] = useState<readonly ApiCandle[]>([]);
  const [chartState, setChartState] = useState<ChartState>("loading");
  const [chartError, setChartError] = useState<string | null>(null);

  const [strategies, setStrategies] = useState<readonly ApiStrategyDescriptor[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [compositeCatalogError, setCompositeCatalogError] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [collectedParameters, setCollectedParameters] = useState<ApiStrategyParameters>({});

  const [run, setRun] = useState<BacktestRunResponse | null>(null);
  const [result, setResult] = useState<BacktestResultResponse | null>(null);
  const [tradesResponse, setTradesResponse] = useState<BacktestTradesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const selectedStrategy = useMemo(
    () => strategies.find((descriptor) => descriptor.id === strategyId) ?? null,
    [strategies, strategyId]
  );
  const parameters = useMemo(
    () => parametersForSchema(selectedStrategy?.parameterSchema, collectedParameters),
    [selectedStrategy, collectedParameters]
  );

  // The strategy catalog owns the list, the versions, and the parameter schema.
  useEffect(() => {
    let active = true;
    Promise.all([
      getStrategies(),
      listComposites().catch((error: unknown) => {
        if (active) setCompositeCatalogError(failureMessage(error));
        return [];
      })
    ])
      .then(([response, composites]) => {
        if (!active) return;
        const compositeDescriptors: ApiStrategyDescriptor[] = composites.map(
          (composite) => composite.descriptor
        );
        const options = [...response.strategies, ...compositeDescriptors];
        setStrategies(options);
        setStrategyId(options[0]?.id ?? null);
        setCatalogError(null);
      })
      .catch((error: unknown) => {
        if (active) setCatalogError(failureMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  // The chart shows exactly the window the backtest will run on. The server caps
  // how many candles one read may return, so a wide window at a fine timeframe is
  // refused. The backtest itself has no such cap, so this must report the server's
  // own reason instead of failing silently: the run stays valid, only the drawing
  // is unavailable.
  useEffect(() => {
    let active = true;
    setChartState("loading");
    setChartError(null);
    void getCandleHistory({
      provider: "binance",
      symbol,
      timeframe,
      startTime: range.startTime,
      endTime: range.endTime
    })
      .then((response) => {
        if (active) {
          setCandles(response.candles);
          setChartState("ready");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCandles([]);
          setChartError(failureMessage(error));
          setChartState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [symbol, timeframe, range.startTime, range.endTime]);

  // Execution is asynchronous, so the page polls the run status until it settles.
  useEffect(() => {
    if (run === null || run.status === "completed" || run.status === "failed") return;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    const poll = async (): Promise<void> => {
      try {
        const next = await getBacktestRun(run.runId);
        if (!active) return;
        setRunError(null);
        setRun(next);
      } catch (error: unknown) {
        if (!active) return;
        // A status read can fail transiently; report it and keep polling rather
        // than leaving the page stuck on an unexplained "running".
        setRunError(failureMessage(error));
        timeoutId = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };
    timeoutId = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [run]);

  const runId = run?.runId;
  const runStatus = run?.status;

  // A settled run has a readable result: metrics and assumptions, or a reason.
  useEffect(() => {
    if (runId === undefined || (runStatus !== "completed" && runStatus !== "failed")) return;
    let active = true;
    void getBacktestResult(runId)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((error: unknown) => {
        if (active) setRunError(failureMessage(error));
      });
    return () => {
      active = false;
    };
  }, [runId, runStatus]);

  // Trades page against the server; the page never loads them all at once.
  useEffect(() => {
    if (runId === undefined || runStatus !== "completed") return;
    let active = true;
    void getBacktestTrades(runId, page, TRADE_PAGE_SIZE)
      .then((value) => {
        if (active) setTradesResponse(value);
      })
      .catch((error: unknown) => {
        if (active) setRunError(failureMessage(error));
      });
    return () => {
      active = false;
    };
  }, [runId, runStatus, page]);

  // The chosen window survives a timeframe change; only its resolution changes.
  const handleTimeframeChange = (next: ApiTimeframe): void => {
    setTimeframe(next);
    setRange((current) => ({
      startTime: alignToCandleOpen(current.startTime, next),
      endTime: alignToCandleOpen(current.endTime, next)
    }));
  };

  const handleStrategyChange = (nextId: string): void => {
    setStrategyId(nextId);
    setCollectedParameters({});
  };

  const handleParametersChange = useCallback((next: ApiStrategyParameters): void => {
    setCollectedParameters(next);
  }, []);

  const handleStart = async (): Promise<void> => {
    if (selectedStrategy === null) {
      setStartError("Select a strategy before starting a backtest.");
      return;
    }
    setStarting(true);
    setStartError(null);
    setRunError(null);
    setRun(null);
    setResult(null);
    setTradesResponse(null);
    setSelectedTradeId(null);
    setPage(1);
    try {
      const specification = await createSpecification({
        schemaVersion: "v1",
        dataset: {
          provider: "binance",
          symbol,
          timeframe,
          startTime: range.startTime,
          endTime: range.endTime
        },
        strategy: {
          id: selectedStrategy.id,
          version: selectedStrategy.version,
          parameters
        }
      });
      setRun(await startBacktest({ specId: specification.specId }));
    } catch (error: unknown) {
      setStartError(failureMessage(error));
    } finally {
      setStarting(false);
    }
  };

  const handleTradeClick = (sequenceNumber: number): void => {
    setSelectedTradeId((current) => (current === sequenceNumber ? null : sequenceNumber));
  };

  const completed = completedResult(result);
  const trades = tradePage(tradesResponse);
  const totalPages =
    trades === null ? 1 : Math.max(1, Math.ceil(trades.page.totalCount / trades.page.pageSize));

  return (
    <section className="backtest-page">
      <div className="page-heading">
        <div>
          <h1>Backtest</h1>
          <p>Run one strategy over a window of normalized BTCUSDT history and read its result.</p>
        </div>
      </div>

      <div className="stacked-sections">
        <section className="panel" aria-labelledby="backtest-configuration-heading">
          <header className="panel-header">
            <div>
              <h2 id="backtest-configuration-heading">Configuration</h2>
              <p>Choose the data window, then the strategy to run over it</p>
            </div>
          </header>
          <div className="panel-body">
            <section className="form-section">
              <h3 className="section-title"><span className="step">1</span> Data</h3>
              <div className="field-grid field-grid-3">
                <label className="field">
                  <span className="field-label">Symbol</span>
                  <select
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value as Symbol)}
                  >
                    {SYMBOLS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Timeframe</span>
                  <select
                    value={timeframe}
                    onChange={(event) => handleTimeframeChange(event.target.value as ApiTimeframe)}
                  >
                    {API_TIMEFRAMES.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Start date</span>
                  <input
                    type="date"
                    value={toDateInputValue(range.startTime)}
                    onChange={(event) => {
                      const parsed = fromDateInputValue(event.target.value, "start");
                      if (parsed !== null) {
                        setRange((current) => ({
                          ...current,
                          startTime: alignToCandleOpen(parsed, timeframe)
                        }));
                      }
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">End date</span>
                  <input
                    type="date"
                    value={toDateInputValue(range.endTime)}
                    onChange={(event) => {
                      const parsed = fromDateInputValue(event.target.value, "end");
                      if (parsed !== null) {
                        setRange((current) => ({
                          ...current,
                          endTime: alignToCandleOpen(parsed, timeframe)
                        }));
                      }
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3 className="section-title"><span className="step">2</span> Strategy</h3>
              {catalogError !== null ? (
                <p className="banner banner-error" role="alert">
                  Could not load the strategy catalog: {catalogError}
                </p>
              ) : (
                <div className="field-grid field-grid-3 field-grid-fill">
                  <label className="field">
                    <span className="field-label">Strategy</span>
                    <select
                      value={strategyId ?? ""}
                      disabled={strategies.length === 0}
                      onChange={(event) => handleStrategyChange(event.target.value)}
                    >
                      {strategies.length === 0 && <option value="">Loading strategies...</option>}
                      {strategies.map((descriptor) => (
                        <option key={descriptor.id} value={descriptor.id}>{descriptor.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {compositeCatalogError !== null && (
                <p className="banner banner-error" role="alert">
                  Could not load saved composites: {compositeCatalogError}
                </p>
              )}

              {selectedStrategy !== null && (
                <>
                  <h4 className="subsection-title">Parameters</h4>
                  <GenericParameterForm
                    schema={selectedStrategy.parameterSchema}
                    values={parameters}
                    onChange={handleParametersChange}
                  />
                </>
              )}
            </section>

            <div className="run-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => void handleStart()}
                disabled={starting || selectedStrategy === null}
              >
                Start Backtest
              </button>
              {run !== null && (
                <span className="status-chip" data-status={run.status}>Status: {run.status}</span>
              )}
            </div>
            {startError !== null && (
              <p className="banner banner-error" role="alert">
                Could not start the backtest: {startError}
              </p>
            )}
            {result?.status === "failed" && (
              <p className="banner banner-error" role="alert">Error: {result.failureReason}</p>
            )}
            {runError !== null && (
              <p className="banner banner-error" role="alert">Could not read the run: {runError}</p>
            )}
          </div>
        </section>

        {completed !== null && (
          <section className="panel" aria-labelledby="backtest-result-heading">
            <header className="panel-header">
              <div>
                <h2 id="backtest-result-heading">Result</h2>
                <p>Every number below is computed and stamped by the backend</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="metric-grid">
                <div
                  className="metric-card"
                  data-tone={completed.metrics.totalReturn < 0 ? "negative" : "positive"}
                >
                  <span className="metric-label">Total return</span>
                  <span className="metric-value">{formatPercent(completed.metrics.totalReturn)}</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Win rate</span>
                  <span className="metric-value">{formatPercent(completed.metrics.winRate)}</span>
                </div>
                <div className="metric-card" data-tone="negative">
                  <span className="metric-label">Max drawdown</span>
                  <span className="metric-value">
                    {formatPercent(completed.metrics.maximumDrawdown)}
                  </span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Trades</span>
                  <span className="metric-value">{completed.metrics.numberOfTrades}</span>
                </div>
              </div>

              <section className="form-section">
                <h3 className="subsection-title">Trades</h3>
                {trades === null ? (
                  <p role="status">Loading trades...</p>
                ) : trades.trades.length === 0 ? (
                  <p className="empty-state">No trades executed.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Entry time</th>
                          <th className="numeric">Entry price</th>
                          <th>Exit time</th>
                          <th className="numeric">Exit price</th>
                          <th>Direction</th>
                          <th className="numeric">Entry fee</th>
                          <th className="numeric">Exit fee</th>
                          <th className="numeric">Slippage</th>
                          <th className="numeric">PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.trades.map((trade) => (
                          <tr
                            key={trade.sequenceNumber}
                            onClick={() => handleTradeClick(trade.sequenceNumber)}
                            aria-selected={selectedTradeId === trade.sequenceNumber}
                            className={
                              selectedTradeId === trade.sequenceNumber
                                ? "clickable selected"
                                : "clickable"
                            }
                          >
                            <td>{formatDateTime(trade.entryTime)}</td>
                            <td className="numeric">{formatMoney(trade.entryPrice)}</td>
                            <td>{formatDateTime(trade.exitTime)}</td>
                            <td className="numeric">{formatMoney(trade.exitPrice)}</td>
                            <td>
                              <span className={`direction-${trade.direction}`}>
                                {trade.direction}
                              </span>
                            </td>
                            <td className="numeric">{formatMoney(trade.entryFee)}</td>
                            <td className="numeric">{formatMoney(trade.exitFee)}</td>
                            <td className="numeric">{formatMoney(trade.slippage)}</td>
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
                <div className="table-footer">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Prev
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                  {selectedTradeId !== null && (
                    <button type="button" onClick={() => setSelectedTradeId(null)}>
                      Clear selection
                    </button>
                  )}
                </div>
              </section>

              <section className="form-section">
                <h3 className="subsection-title">Execution assumptions</h3>
                <ul className="provenance-list">
                  <li>
                    <span className="provenance-term">Initial capital</span>
                    {formatMoney(completed.executionAssumptions.initialCapital)}
                  </li>
                  <li>
                    <span className="provenance-term">Fee rate</span>
                    {formatPercent(completed.executionAssumptions.feeRate, 4)}
                  </li>
                  <li>
                    <span className="provenance-term">Slippage rate</span>
                    {formatPercent(completed.executionAssumptions.slippageRate, 4)}
                  </li>
                  <li>
                    <span className="provenance-term">Fill rule</span>
                    {completed.executionAssumptions.fillRule}
                  </li>
                  <li>
                    <span className="provenance-term">Signal timing</span>
                    {completed.executionAssumptions.signalTiming}
                  </li>
                </ul>
              </section>

              <details className="provenance">
                <summary>Run provenance</summary>
                <ul className="provenance-list">
                  <li>
                    <span className="provenance-term">Specification</span>
                    <span className="provenance-value" title={completed.specId}>
                      {truncateHash(completed.specId)}
                    </span>
                  </li>
                  <li>
                    <span className="provenance-term">Specification hash</span>
                    <span className="provenance-value" title={completed.specificationHash}>
                      {truncateHash(completed.specificationHash)}
                    </span>
                  </li>
                  <li>
                    <span className="provenance-term">Metric set</span>
                    <span className="provenance-value">
                      {completed.metricSet.id} {completed.metricSet.version}
                    </span>
                  </li>
                </ul>
              </details>
            </div>
          </section>
        )}

        <div className="chart-card">
          <div className="chart-title">
            <strong>{symbol}</strong>
            <span>Binance · {timeframe} · selected window</span>
          </div>
          <CandlestickChart
            state={chartState}
            candles={candles}
            annotations={completed?.annotations ?? []}
            trades={trades?.trades ?? []}
            selectedTradeId={selectedTradeId}
            errorMessage={chartError}
          />
        </div>
      </div>
    </section>
  );
}
