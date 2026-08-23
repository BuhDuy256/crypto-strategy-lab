// V1 backtest page market chart; later UI slices add the run form and results.

import {
  API_TIMEFRAMES,
  type ApiCandle,
  type ApiTimeframe,
  type CandleHistoryRequest
} from "@crypto-strategy-lab/api-contracts";
import { useEffect, useState } from "react";
import { getCandleHistory } from "../api/client.js";
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
      <div className="chart-card">
        <div className="chart-title">
          <strong>BTCUSDT</strong>
          <span>Binance · {timeframe} · latest {CANDLE_COUNT} closed candles</span>
        </div>
        <CandlestickChart state={chartState} candles={candles} />
      </div>
    </section>
  );
}
