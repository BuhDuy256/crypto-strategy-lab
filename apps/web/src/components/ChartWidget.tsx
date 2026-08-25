import { useEffect, useState, useRef } from "react";
import type { ApiCandle, ApiTimeframe } from "@crypto-strategy-lab/api-contracts";
import { CandlestickChart } from "./CandlestickChart.js";
// import { getCandleHistory, type CandleHistoryRequest } from "../api/client.js";

interface ChartWidgetProps {
  id: string;
  initialTimeframe: ApiTimeframe;
}

// Helper to generate visually pleasing dummy candlestick data
function generateDummyCandles(count: number): ApiCandle[] {
  const candles: ApiCandle[] = [];
  let basePrice = 60000;
  const now = Math.floor(Date.now() / 1000);
  // Interval in seconds, e.g., 5m = 300
  const interval = 300; 

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * interval;
    const volatility = basePrice * 0.002;
    const open = basePrice + (Math.random() - 0.5) * volatility;
    const close = open + (Math.random() - 0.5) * volatility * 1.5;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;
    const volume = Math.random() * 100;
    
    candles.push({
      provider: "binance", symbol: "BTCUSDT", timeframe: "5m", closed: true, revision: 1,
      openTime: time * 1000,
      closeTime: (time + interval - 1) * 1000,
      open, high, low, close, volume,
    });
    
    // add trend
    basePrice = close + (Math.random() - 0.48) * volatility;
  }
  return candles;
}

export function ChartWidget({ id, initialTimeframe }: ChartWidgetProps) {
  const [timeframe, setTimeframe] = useState<ApiTimeframe>(initialTimeframe);
  const [data, setData] = useState<readonly ApiCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setIsLoading(true);
      setIsError(false);
      try {
        // [API INTEGRATION POINT] 
        // Later, uncomment this section to fetch real data from the backend
        /*
        const now = new Date().getTime();
        const startTime = now - (30 * 24 * 60 * 60 * 1000); // last 30 days
        
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
        */

        // For now, load dummy data with a slight delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 600));
        if (active) {
          setData(generateDummyCandles(150));
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
    <div className="flex flex-col border border-gray-700/50 rounded-xl bg-gray-900 shadow-xl overflow-hidden h-[500px]" ref={containerRef}>
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700/50 bg-[#1e222d]/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-gray-100 font-bold text-base tracking-wide">BTC/USDT</span>
          </div>
          <span className="text-xs text-blue-400 font-mono bg-blue-900/20 border border-blue-800/30 px-2 py-1 rounded-md">{id}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 font-semibold uppercase tracking-widest">Timeframe</label>
          <select 
            className="bg-[#2a2e39] hover:bg-[#363a45] text-gray-200 border-none rounded px-3 py-1.5 text-sm font-medium outline-none transition-colors cursor-pointer shadow-inner"
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
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]/90 backdrop-blur-sm">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-blue-400 text-sm font-semibold tracking-wide">LOADING MARKET DATA...</span>
            </div>
          </div>
        )}
        
        {isError && !isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]">
            <div className="text-center p-8 bg-red-950/20 rounded-xl border border-red-900/30">
              <p className="text-red-400 font-bold mb-2 text-lg">Failed to load market data</p>
              <p className="text-red-500/60 text-sm">Please check your connection and try again.</p>
            </div>
          </div>
        )}
        
        {!isLoading && !isError && data.length > 0 && (
          <CandlestickChart state="ready" candles={data} />
        )}
      </div>
    </div>
  );
}
