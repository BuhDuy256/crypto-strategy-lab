import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import { BacktestPage } from "./pages/BacktestPage.js";
import { RealtimePage } from "./pages/RealtimePage.js";
import { StrategyEnginePage } from "./pages/StrategyEnginePage.js";
import { DiscoveryPage } from "./pages/DiscoveryPage.js";
import { NewsPage } from "./pages/NewsPage.js";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/backtest" replace />} />
        <Route path="backtest" element={<BacktestPage />} />
        <Route path="realtime" element={<RealtimePage />} />
        <Route path="strategy-engine" element={<StrategyEnginePage />} />
        <Route path="discovery" element={<DiscoveryPage />} />
        <Route path="news" element={<NewsPage />} />
      </Route>
    </Routes>
  );
}
