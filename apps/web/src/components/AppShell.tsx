import { NavLink, Outlet } from "react-router-dom";
import { HealthStatus } from "./HealthStatus.js";
import { ProviderHealthIndicator } from "./ProviderHealthIndicator.js";

const NAV_ITEMS = [
  { to: "/backtest", label: "Backtest" },
  { to: "/realtime", label: "Realtime" },
  { to: "/strategy-engine", label: "Strategy Engine" },
  { to: "/discovery", label: "Discovery" },
  { to: "/news", label: "News" }
] as const;

/**
 * Application shell: navigation between the app's routes, Market Data's provider
 * health, and a live backend health indicator.
 *
 * The two indicators answer different questions and are deliberately separate:
 * one says whether the API is reachable, the other says whether the exchange
 * connection behind it is delivering candles.
 */
export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">Crypto Strategy Lab</span>
        <ProviderHealthIndicator />
        <HealthStatus />
      </header>
      <div className="app-body">
        <nav className="app-nav" aria-label="Main navigation">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
