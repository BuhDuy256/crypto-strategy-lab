import { ChartWidget } from "../components/ChartWidget.js";
import type { ApiTimeframe } from "@crypto-strategy-lab/api-contracts";

export function RealtimePage() {
  const initialCharts: { id: string; timeframe: ApiTimeframe }[] = [
    { id: "chart-1", timeframe: "5m" },
    { id: "chart-2", timeframe: "15m" },
    { id: "chart-3", timeframe: "1h" },
    { id: "chart-4", timeframe: "4h" }
  ];

  return (
    <div className="p-4 md:p-8 max-w-[2000px] mx-auto flex flex-col gap-6 md:gap-8 h-full min-h-screen bg-[#0b0e14]">
      <div className="flex flex-col mb-2 border-b border-gray-800 pb-4 md:pb-6">
        <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">Realtime Markets</h1>
        <p className="text-gray-400 mt-2 text-base md:text-lg font-medium">Multi-timeframe market analysis.</p>
      </div>

      {/* Changed to md:grid-cols-2 so it is a 2x2 grid on most desktop/tablet screens, falling back to 1 column only on small mobile screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 flex-1">
        {initialCharts.map(chart => (
          <ChartWidget 
            key={chart.id} 
            id={chart.id} 
            initialTimeframe={chart.timeframe} 
          />
        ))}
      </div>
    </div>
  );
}
