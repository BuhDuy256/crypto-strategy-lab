import {
  API_TIMEFRAMES,
  type ApiCandle,
  type ApiTimeframe,
  type CandleHistoryRequest,
  type BacktestRunResponse,
  type BacktestResultResponse,
  type BacktestTradesResponse
} from "@crypto-strategy-lab/api-contracts";
import { useEffect, useState } from "react";
import {
  getCandleHistory,
  createSpecification,
  startBacktest,
  getBacktestRun,
  getBacktestResult,
  getBacktestTrades
} from "../api/client.js";
import { CandlestickChart, type ChartState } from "../components/CandlestickChart.js";

const CANDLE_COUNT = 200;
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

export function BacktestPage() {
  const [timeframe, setTimeframe] = useState<ApiTimeframe>("1h");
  const [candles, setCandles] = useState<readonly ApiCandle[]>([]);
  const [chartState, setChartState] = useState<ChartState>("loading");

  const [strategy, setStrategy] = useState("ma-crossover");
  const [fastPeriod, setFastPeriod] = useState(10);
  const [slowPeriod, setSlowPeriod] = useState(20);
  
  const [run, setRun] = useState<BacktestRunResponse | null>(null);
  const [result, setResult] = useState<BacktestResultResponse | null>(null);
  const [tradesResponse, setTradesResponse] = useState<BacktestTradesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setChartState("loading");
    void getCandleHistory(buildRecentCandleRequest(timeframe, Date.now()))
      .then((response) => {
        if (active) {
          setCandles(response.candles);
          setChartState("ready");
        }
      })
      .catch(() => {
        if (active) {
          setCandles([]);
          setChartState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [timeframe]);

  // Polling loop
  useEffect(() => {
    if (!run || run.status === "completed" || run.status === "failed") return;

    let timeoutId: NodeJS.Timeout;
    const poll = async () => {
      try {
        const nextRun = await getBacktestRun(run.runId);
        setRun(nextRun);
        if (nextRun.status === "completed") {
          const res = await getBacktestResult(nextRun.runId);
          setResult(res);
          const trs = await getBacktestTrades(nextRun.runId, 1, 20);
          setTradesResponse(trs);
          setPage(1);
        } else if (nextRun.status === "failed") {
          const res = await getBacktestResult(nextRun.runId);
          setResult(res);
        } else {
          timeoutId = setTimeout(poll, 2000);
        }
      } catch {
        timeoutId = setTimeout(poll, 2000);
      }
    };
    timeoutId = setTimeout(poll, 2000);
    return () => clearTimeout(timeoutId);
  }, [run]);

  // Pagination effect
  useEffect(() => {
    if (run?.status === "completed") {
      void getBacktestTrades(run.runId, page, 20).then(setTradesResponse);
    }
  }, [page, run?.status, run?.runId]);

  const handleStart = async () => {
    setRun(null);
    setResult(null);
    setTradesResponse(null);
    try {
      const spec = await createSpecification({
        schemaVersion: "v1",
        datasetRef: { datasetId: "binance-BTCUSDT-1h", version: 1, manifestVersion: "v1", provider: "binance", symbols: ["BTCUSDT"], timeframe: "1h", range: { startTime: 0, endTime: 1 }, revisionWatermark: 1, integrityHash: "hash" },
        strategy: {
          id: strategy,
          version: "1.0.0",
          parameters: { fastPeriod, slowPeriod }
        },
        execution: {
          initialCapital: 1000,
          feeRate: 0.001,
          slippageRate: 0.001,
          signalTiming: "close-of-bar", 
          leverage: 1,
          positionSizing: "available-equity",
          allowedDirections: ["long", "short"],
          stopLoss: { enabled: false },
          takeProfit: { enabled: false },
          sameBarExitPriority: "stop-loss-first",
          finalPositionPolicy: "liquidate-at-final-close",
          decimalPlaces: 8
        },
        metricSet: { id: "core", version: "1.0.0" }
      });
      const newRun = await startBacktest({ specId: spec.specId });
      setRun(newRun);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section className="backtest-page">
      <div className="page-heading">
        <div>
          <h1>Backtest</h1>
          <p>Inspect normalized BTCUSDT history before configuring an experiment.</p>
        </div>
        <label className="timeframe-control">
          <span>Timeframe</span>
          <select
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value as ApiTimeframe)}
          >
            {API_TIMEFRAMES.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="configuration-panel">
        <label>
          <span>Strategy</span>
          <input value={strategy} onChange={e => setStrategy(e.target.value)} />
        </label>
        <label>
          <span>Fast Period</span>
          <input type="number" value={fastPeriod} onChange={e => setFastPeriod(Number(e.target.value))} />
        </label>
        <label>
          <span>Slow Period</span>
          <input type="number" value={slowPeriod} onChange={e => setSlowPeriod(Number(e.target.value))} />
        </label>
        <button onClick={handleStart}>Start Backtest</button>
      </div>

      {run && (
        <div className="run-status">
          <h2>Status: {run.status}</h2>
          {result?.status === "failed" && <p>Error: {result.failureReason}</p>}
        </div>
      )}

      {result?.status === "completed" && (
        <div className="results-panel">
          <div className="metrics">
            <div>Total Return: {result.metrics.totalReturn}%</div>
            <div>Win Rate: {result.metrics.winRate}%</div>
            <div>Max Drawdown: {result.metrics.maximumDrawdown}%</div>
            <div>Trades: {result.metrics.numberOfTrades}</div>
          </div>
          
          <div className="assumptions-panel">
            <h3>Execution Assumptions</h3>
            <ul>
              <li>Initial Capital: {result.executionAssumptions.initialCapital}</li>
              <li>Fee Rate: {result.executionAssumptions.feeRate}</li>
              <li>Slippage Rate: {result.executionAssumptions.slippageRate}</li>
              <li>Fill Rule: {result.executionAssumptions.fillRule}</li>
            </ul>
          </div>

          <div className="trades-table">
            <h3>Trades (Page {page})</h3>
            {(tradesResponse as any)?.trades.length === 0 ? (
              <p>No trades executed.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Entry Time</th>
                    <th>Entry Price</th>
                    <th>Exit Time</th>
                    <th>Exit Price</th>
                    <th>Direction</th>
                    <th>Fees</th>
                    <th>Slippage</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {(tradesResponse as any)?.trades.map((t: any, i: number) => (
                    <tr key={i}>
                      <td>{new Date(t.entryTime).toISOString()}</td>
                      <td>{t.entryPrice}</td>
                      <td>{t.exitTime ? new Date(t.exitTime).toISOString() : ""}</td>
                      <td>{t.exitPrice}</td>
                      <td>{t.direction}</td>
                      <td>{t.fees}</td>
                      <td>{t.slippage}</td>
                      <td>{t.profitAndLoss}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>{page} / {tradesResponse ? Math.ceil((tradesResponse as any)?.page?.totalCount / 20) : 1}</span>
              <button disabled={!tradesResponse || page >= Math.ceil((tradesResponse as any)?.page?.totalCount / 20)} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}

      <div className="chart-card">
        <div className="chart-title">
          <strong>BTCUSDT</strong>
          <span>Binance · {timeframe} · latest {CANDLE_COUNT} closed candles</span>
        </div>
        <CandlestickChart state={chartState} candles={candles} annotations={(result as any)?.annotations || []} trades={(tradesResponse as any)?.trades || []} selectedTradeId={selectedTradeId} />
      </div>
    </section>
  );
}
