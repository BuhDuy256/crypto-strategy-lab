p = "apps/web/src/pages/BacktestPage.test.tsx"
s = open(p, encoding="utf-8").read()

old = '''    await waitFor(() => expect(screen.getByText("Total Return: 0.125")).toBeDefined());

    expect(screen.getByText("Win Rate: 0.6")).toBeDefined();
    expect(screen.getByText("Max Drawdown: 0.05")).toBeDefined();
    expect(screen.getByText("Trades: 10")).toBeDefined();
    expect(screen.getByText("Fill Rule: next-open")).toBeDefined();
    expect(screen.getByText("Initial Capital: 10000")).toBeDefined();
    expect(screen.getByText(`Specification hash: ${"a".repeat(64)}`)).toBeDefined();'''
new = '''    // The backend still owns every number; the page only writes each one in a
    // readable form next to its label.
    await waitFor(() => expect(metricValue("Total return")).toBe("12.5%"));

    expect(metricValue("Win rate")).toBe("60%");
    expect(metricValue("Max drawdown")).toBe("5%");
    expect(metricValue("Trades")).toBe("10");
    expect(screen.getByText("Fill rule").parentElement?.textContent)
      .toBe("Fill rulenext-open");
    expect(screen.getByText("Initial capital").parentElement?.textContent)
      .toBe("Initial capital10,000.00");
    // The full hash stays reachable; only its rendering is shortened.
    const hash = screen.getByText("Specification hash").parentElement
      ?.querySelector(".provenance-value");
    expect(hash?.getAttribute("title")).toBe("a".repeat(64));'''
assert old in s
s = s.replace(old, new, 1)

old = '''    await waitFor(() => expect(screen.getByText("No trades executed.")).toBeDefined());
    expect(screen.getByText("Trades: 0")).toBeDefined();'''
new = '''    await waitFor(() => expect(screen.getByText("No trades executed.")).toBeDefined());
    expect(metricValue("Trades")).toBe("0");'''
assert old in s
s = s.replace(old, new, 1)

old = '    await waitFor(() => expect(screen.getByText("2 / 2")).toBeDefined());'
new = '    await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeDefined());'
assert old in s
s = s.replace(old, new, 1)

# One helper for the metric cards, declared next to the other test helpers.
old = "describe("
index = s.index(old)
helper = '''/** Reads the number a metric card shows, by its visible label. */
function metricValue(label: string): string | undefined {
  return screen.getByText(label).parentElement?.querySelector(".metric-value")
    ?.textContent ?? undefined;
}

'''
s = s[:index] + helper + s[index:]

open(p, "w", encoding="utf-8").write(s)
print("patched test")
