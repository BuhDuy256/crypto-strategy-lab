p = "apps/web/src/pages/BacktestPage.tsx"
s = open(p, encoding="utf-8").read()

# Shared formatters replace the page-local date helper.
old = 'import { GenericParameterForm } from "../components/GenericParameterForm.js";'
new = (old + "\nimport {\n"
       "  formatDateTime,\n"
       "  formatMoney,\n"
       "  formatPercent,\n"
       "  fromDateInputValue,\n"
       "  toDateInputValue,\n"
       "  truncateHash\n"
       '} from "../format.js";')
assert old in s
s = s.replace(old, new, 1)

old = '''/** Formats an epoch millisecond value for a `type="date"` input (UTC calendar day). */
function toDateInputValue(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

'''
assert old in s
s = s.replace(old, "", 1)

marker = '  return (\n    <section className="backtest-page">'
index = s.index(marker)
render = open(".scratch/ui-rescue/backtest-render.tsx", encoding="utf-8").read()
s = s[:index] + render

open(p, "w", encoding="utf-8").write(s)
print("patched")
