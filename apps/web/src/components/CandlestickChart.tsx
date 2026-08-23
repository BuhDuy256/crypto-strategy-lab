// Presentation-only candlestick and volume chart for normalized backend candles.

import type { ApiCandle } from "@crypto-strategy-lab/api-contracts";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export type ChartState = "loading" | "ready" | "error";

interface CandlestickChartProps {
  readonly state: ChartState;
  readonly candles: readonly ApiCandle[];
}

function chartTime(openTime: number): UTCTimestamp {
  return Math.floor(openTime / 1_000) as UTCTimestamp;
}

export function CandlestickChart({ state, candles }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (state !== "ready" || candles.length === 0 || container === null) {
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#24292f"
      },
      grid: {
        vertLines: { color: "#eef1f4" },
        horzLines: { color: "#eef1f4" }
      },
      rightPriceScale: { borderColor: "#d8dee4" },
      timeScale: { borderColor: "#d8dee4", timeVisible: true }
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#2da44e",
      downColor: "#cf222e",
      borderVisible: false,
      wickUpColor: "#2da44e",
      wickDownColor: "#cf222e"
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume"
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 }
    });

    const candleData: CandlestickData<UTCTimestamp>[] = candles.map((candle) => ({
      time: chartTime(candle.openTime),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));
    const volumeData: HistogramData<UTCTimestamp>[] = candles.map((candle) => ({
      time: chartTime(candle.openTime),
      value: candle.volume,
      color: candle.close >= candle.open ? "#2da44e88" : "#cf222e88"
    }));
    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);
    chart.timeScale().fitContent();

    const resize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [candles, state]);

  if (state === "loading") {
    return <div role="status" className="chart-state">Loading market data...</div>;
  }
  if (state === "error") {
    return <div role="alert" className="chart-state chart-error">Could not load market data.</div>;
  }
  if (candles.length === 0) {
    return <div role="status" className="chart-state">No candles available for this timeframe.</div>;
  }
  return <div ref={containerRef} className="candlestick-chart" aria-label="BTCUSDT candlestick chart" />;
}
