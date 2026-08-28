// Presentation-only candlestick and volume chart for normalized backend candles.

import type { ApiCandle } from "@crypto-strategy-lab/api-contracts";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
  type SeriesMarker
} from "lightweight-charts";
import type { ApiAnnotation, ApiBacktestTrade } from "@crypto-strategy-lab/api-contracts";
import { useEffect, useRef } from "react";

export type ChartState = "loading" | "ready" | "error";

interface CandlestickChartProps {
  readonly state: ChartState;
  readonly candles: readonly ApiCandle[];
  readonly annotations?: readonly ApiAnnotation[];
  readonly trades?: readonly ApiBacktestTrade[];
  readonly selectedTradeId?: number | null;
  // Reason the market data could not be loaded, shown instead of the generic
  // message. A caller that knows why (for example a range the server refuses)
  // passes it so the reader is not left guessing.
  readonly errorMessage?: string | null;
}

function chartTime(openTime: number): UTCTimestamp {
  return Math.floor(openTime / 1_000) as UTCTimestamp;
}

export function CandlestickChart({ state, candles, annotations = [], trades = [], selectedTradeId = null, errorMessage = null }: CandlestickChartProps) {
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

    const selectedTrade = trades.find(t => t.sequenceNumber === selectedTradeId);
    if (selectedTrade) {
      candleSeries.createPriceLine({
        price: selectedTrade.exitPrice,
        color: selectedTrade.profitAndLoss >= 0 ? "#2da44e" : "#cf222e",
        lineWidth: 2,
        lineStyle: 1,
        axisLabelVisible: true,
        title: "Exit",
      });
      candleSeries.createPriceLine({
        price: selectedTrade.entryPrice,
        color: "#0969da",
        lineWidth: 2,
        lineStyle: 1,
        axisLabelVisible: true,
        title: "Entry",
      });
      chart.timeScale().setVisibleRange({
        from: chartTime(selectedTrade.entryTime),
        to: chartTime(selectedTrade.exitTime)
      });
    }


    const markers: SeriesMarker<UTCTimestamp>[] = [];
    for (const trade of trades) {
      markers.push({
        time: chartTime(trade.entryTime),
        position: trade.direction === "long" ? "belowBar" : "aboveBar",
        color: trade.direction === "long" ? "#2da44e" : "#cf222e",
        shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
        text: `Entry ${trade.direction}`
      });
      markers.push({
        time: chartTime(trade.exitTime),
        position: trade.direction === "long" ? "aboveBar" : "belowBar",
        color: trade.profitAndLoss >= 0 ? "#2da44e" : "#cf222e",
        shape: trade.direction === "long" ? "arrowDown" : "arrowUp",
        text: `Exit (${trade.exitReason})`
      });
    }

    for (const ann of annotations) {
      switch (ann.type) {
        case "marker":
          markers.push({
            time: chartTime(ann.time),
            position: ann.direction === "up" ? "belowBar" : ann.direction === "down" ? "aboveBar" : "inBar",
            color: ann.direction === "up" ? "#2da44e" : ann.direction === "down" ? "#cf222e" : "#888888",
            shape: ann.direction === "up" ? "arrowUp" : ann.direction === "down" ? "arrowDown" : "circle",
            text: ann.label,
            id: ann.id
          });
          break;
        case "line": {
          const s = chart.addSeries(LineSeries, { color: "#0969da", lineWidth: 2 });
          s.setData(ann.points.map(p => ({ time: chartTime(p.time), value: p.value })));
          break;
        }
        case "band": {
          const upper = chart.addSeries(LineSeries, { color: "#8250df", lineWidth: 1, lineStyle: 2 });
          const lower = chart.addSeries(LineSeries, { color: "#8250df", lineWidth: 1, lineStyle: 2 });
          upper.setData(ann.upper.map(p => ({ time: chartTime(p.time), value: p.value })));
          lower.setData(ann.lower.map(p => ({ time: chartTime(p.time), value: p.value })));
          break;
        }
        case "zone": {
          const upper = chart.addSeries(LineSeries, { color: "#bf8700", lineWidth: 1 });
          const lower = chart.addSeries(LineSeries, { color: "#bf8700", lineWidth: 1 });
          upper.setData([{ time: chartTime(ann.startTime), value: ann.upper }, { time: chartTime(ann.endTime), value: ann.upper }]);
          lower.setData([{ time: chartTime(ann.startTime), value: ann.lower }, { time: chartTime(ann.endTime), value: ann.lower }]);
          break;
        }
        case "level":
          candleSeries.createPriceLine({
            price: ann.value,
            color: "#cf222e",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: ann.label,
          });
          break;
      }
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    if (markers.length > 0) {
      // @ts-expect-error setMarkers exists but ts complains
      candleSeries.setMarkers(markers);
    }


    const resize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [candles, state, annotations, trades, selectedTradeId]);

  if (state === "loading") {
    return <div role="status" className="chart-state">Loading market data...</div>;
  }
  if (state === "error") {
    return (
      <div role="alert" className="chart-state chart-error">
        {errorMessage === null || errorMessage.trim() === ""
          ? "Could not load market data."
          : `Could not load market data: ${errorMessage}`}
      </div>
    );
  }
  if (candles.length === 0) {
    return <div role="status" className="chart-state">No candles available for this timeframe.</div>;
  }
  return <div ref={containerRef} className="candlestick-chart" aria-label="BTCUSDT candlestick chart" />;
}
