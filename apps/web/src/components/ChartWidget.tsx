import { useEffect, useState, useRef } from "react";
import type { ApiCandle, CandleHistoryRequest, ApiTimeframe } from "@crypto-strategy-lab/api-contracts";
import { getCandleHistory } from "../api/client.js";
import { CandlestickChart } from "./CandlestickChart.js";

interface ChartWidgetProps {
  id: string;
  initialTimeframe: ApiTimeframe;
}

export function ChartWidget({ id, initialTimeframe }: ChartWidgetProps) {
  const [timeframe, setTimeframe] = useState<ApiTimeframe>(initialTimeframe);
  const [data, setData] = useState<ApiCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setIsLoading(true);
      setIsError(false);
      try {
        const now = new Date("2024-12-31T00:00:00Z").getTime();
        const startTime = new Date("2020-01-01T00:00:00Z").getTime();
        
        const req: CandleHistoryRequest = {
          provider: "binance",
          symbol: "BTCUSDT",
          timeframe,
          startTime,
          endTime: now
        };
        const res = await getCandleHistory(req);
        if (active) {
          setData(res.candles);
        }
      } catch (err) {
        if (active) setIsError(true);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    
    fetchData();
    
    return () => {
      active = false;
      setData([]); // Ensure state is cleanly released
    };
  }, [timeframe]);

  return (
    <div className="flex flex-col border border-gray-800 rounded-lg bg-gray-900 shadow-sm overflow-hidden h-[450px]" ref={containerRef}>
      <div className="flex justify-between items-center px-5 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <span className="text-gray-100 font-medium text-sm tracking-wide">BINANCE: BTCUSDT</span>
          <span className="text-xs text-gray-500 font-mono bg-gray-800/80 px-2 py-0.5 rounded">{id}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">Timeframe</label>
          <select 
            className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded px-2 py-1 text-sm outline-none transition-colors cursor-pointer"
            value={timeframe}
            onChange={e => setTimeframe(e.target.value as ApiTimeframe)}
          >
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
        </div>
      </div>
      
      <div className="flex-1 relative w-full h-full bg-[#131722]">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]/80 backdrop-blur-sm">
            <div className="animate-pulse flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-blue-400 text-sm font-medium">Loading market data...</span>
            </div>
          </div>
        )}
        
        {isError && !isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]">
            <div className="text-center p-6 bg-red-950/30 rounded-lg border border-red-900/50">
              <p className="text-red-400 font-medium mb-1">Failed to load market data</p>
              <p className="text-red-500/70 text-sm">Please check your connection and try again.</p>
            </div>
          </div>
        )}
        
        {!isLoading && !isError && data.length > 0 && (
          <CandlestickChart state="ready" candles={data} />
        )}
        
        {!isLoading && !isError && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            No data available for this timeframe
          </div>
        )}
      </div>
    </div>
  );
}
