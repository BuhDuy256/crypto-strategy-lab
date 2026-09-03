p = "apps/web/src/pages/DiscoveryPage.tsx"
s = open(p, encoding="utf-8").read()

# 1. Imports: add the shared formatters next to the existing local imports.
old = 'import { pollingSearchDataSource, type SearchDataSource } from "./discovery-data-source.js";'
new = (old + "\nimport {\n"
       "  formatDateTime,\n"
       "  formatMoney,\n"
       "  formatNumber,\n"
       "  formatPercent,\n"
       "  fromDateInputValue,\n"
       "  toDateInputValue\n"
       '} from "../format.js";')
assert old in s
s = s.replace(old, new, 1)

# 2. Candle-open alignment, so a calendar-day choice stays a legal dataset bound.
old = "const CHART_CANDLE_COUNT = 200;"
new = old + """

// A dataset window is addressed by candle open times, so a bound chosen on a
// calendar day is snapped back to the open time that contains it. The Backtest
// page does the same; without it the backend refuses an unaligned bound.
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

function alignToCandleOpen(epochMs: number, timeframe: ApiTimeframe): number {
  const duration = TIMEFRAME_MILLISECONDS[timeframe];
  return Math.floor(epochMs / duration) * duration;
}"""
assert old in s
s = s.replace(old, new, 1)

# 3. Composite entries read as a sentence, not as a machine suffix.
old = '  return `${entry.strategy.composite.name} (composite)`;'
new = '  return `Composite: ${entry.strategy.composite.name}`;'
assert old in s
s = s.replace(old, new, 1)

# 4. "No restorable run" is an absence, not a failure.
old = """  useEffect(() => {
    const stored = readStoredSpecId();
    if (stored !== null) {
      setSpecId(stored);
      void refreshSnapshot(stored, sort).catch(() => setError("Could not restore the last run."));
    }
    // Runs only on mount; a later render must not re-restore from storage.
  }, []);"""
new = """  useEffect(() => {
    const stored = readStoredSpecId();
    if (stored !== null) {
      setSpecId(stored);
      void refreshSnapshot(stored, sort).catch(() => {
        // The stored run is simply not there any more - a reset database, a
        // pruned experiment, another machine. That is an absence, not a
        // failure, so the page forgets it and opens on its normal empty state
        // instead of showing the operator an alarming error they cannot act on.
        setSpecId(null);
        storeSpecId(null);
      });
    }
    // Runs only on mount; a later render must not re-restore from storage.
  }, []);"""
assert old in s
s = s.replace(old, new, 1)

# 5. A timeframe change keeps the chosen window and only changes its resolution.
old = "  async function handleStart(): Promise<void> {"
new = """  // The chosen window survives a timeframe change; only its resolution changes.
  function handleTimeframeChange(next: ApiTimeframe): void {
    setTimeframe(next);
    setStartTime((current) => alignToCandleOpen(current, next));
    setEndTime((current) => alignToCandleOpen(current, next));
  }

  async function handleStart(): Promise<void> {"""
assert old in s
s = s.replace(old, new, 1)

# 6. Replace the whole render with the rescued markup.
marker = '  return (\n    <section className="discovery-page">'
index = s.index(marker)
render = open(".scratch/ui-rescue/discovery-render.tsx", encoding="utf-8").read()
s = s[:index] + render

open(p, "w", encoding="utf-8").write(s)
print("patched")
