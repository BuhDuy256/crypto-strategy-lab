import { PlaceholderPage } from "./PlaceholderPage.js";

// V1 placeholder only. The real Backtest page (charts, run form,
// results table) is built later by slice UI-04. No strategy, backtest,
// or ranking logic belongs here or in any frontend code.
export function BacktestPage() {
  return (
    <PlaceholderPage
      title="Backtest"
      note="Placeholder page. The full backtest configuration and results view is built in a later slice (UI-04)."
    />
  );
}
