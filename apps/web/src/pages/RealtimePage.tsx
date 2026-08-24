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
    <div className="p-6 max-w-[1800px] mx-auto flex flex-col gap-6 h-full min-h-screen bg-black">
      <div className="flex flex-col mb-2">
        <h1 className="text-3xl font-bold text-gray-100 tracking-tight">Realtime Markets</h1>
        <p className="text-gray-400 mt-2">Multi-timeframe market analysis.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1">
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
