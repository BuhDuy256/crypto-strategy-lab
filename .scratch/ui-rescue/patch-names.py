import io

p = "apps/web/src/pages/DiscoveryPage.tsx"
s = io.open(p, encoding="utf-8").read()

old = '''function describeStrategy(entry: ApiLeaderboardEntry): string {
  if (entry.strategy.kind === "single") {
    return `${entry.strategy.id}@${entry.strategy.version}`;
  }
  // The backend already names a generated composite after its parts
  // ("Composite of rsi + moving-average"), so adding a prefix here only
  // repeated the word.
  return entry.strategy.composite.name;
}
'''

new = '''// A leaderboard row has to be told apart from its neighbours at a glance. A
// random search returns many candidates of the same strategy with different
// parameters, so the identifier alone repeats: four rows all reading
// "moving-average@1.0.0". The catalog already carries a readable name and a
// label for every parameter, so a row shows the name first and the parameter
// values that actually differ underneath. The exact identifier and version stay
// on the cell's title attribute, so traceability is not lost.
interface StrategyLabel {
  readonly title: string;
  readonly detail: string;
  readonly reference: string;
}

type StrategyCatalog = ReadonlyMap<string, ApiStrategyDescriptor>;

function describeParameters(
  parameters: Record<string, unknown>,
  descriptor: ApiStrategyDescriptor | undefined
): string {
  return Object.entries(parameters)
    .map(([key, value]) => {
      const label = descriptor?.parameterSchema.properties[key]?.label ?? key;
      return `${label}: ${String(value)}`;
    })
    .join("  \u00b7  ");
}

function describeStrategy(entry: ApiLeaderboardEntry, catalog: StrategyCatalog): StrategyLabel {
  if (entry.strategy.kind === "single") {
    const descriptor = catalog.get(entry.strategy.id);
    return {
      title: descriptor?.name ?? entry.strategy.id,
      detail: describeParameters(entry.strategy.parameters, descriptor),
      reference: `${entry.strategy.id}@${entry.strategy.version}`
    };
  }
  // A generated composite is already named after its parts by the backend
  // ("Composite of rsi + moving-average"). That name stays first, because it is
  // also the name an operator gave a composite they saved themselves; the line
  // below spells the same parts out in catalog words.
  const composite = entry.strategy.composite;
  const parts = composite.components
    .map((component) => catalog.get(component.id)?.name ?? component.id)
    .join(" + ");
  const policy = composite.policy.id.replace(/-/g, " ");
  return {
    title: composite.name,
    detail: `${parts}  \u00b7  ${policy}`,
    reference: `${composite.id}@${composite.version}`
  };
}

// The sort control offered the raw contract values ("maximumDrawdown"). It now
// shows the same words the table headers use.
const SORT_LABELS: Readonly<Record<LeaderboardSort, string>> = {
  rank: "Rank",
  totalReturn: "Total return",
  winRate: "Win rate",
  maximumDrawdown: "Max drawdown",
  numberOfTrades: "Trades"
};
'''

assert old in s
s = s.replace(old, new, 1)

# Sort control labels.
old = '''                  {LEADERBOARD_SORTS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}'''
new = '''                  {LEADERBOARD_SORTS.map((option) => (
                    <option key={option} value={option}>{SORT_LABELS[option]}</option>
                  ))}'''
assert old in s
s = s.replace(old, new, 1)

# Leaderboard strategy cell.
old = '''                          <td className="strategy-cell">{describeStrategy(entry)}</td>'''
new = '''                          <td className="strategy-cell">
                            {(() => {
                              const label = describeStrategy(entry, catalogById);
                              return (
                                <span className="strategy-label" title={label.reference}>
                                  <span className="strategy-title">{label.title}</span>
                                  {label.detail !== "" && (
                                    <span className="strategy-detail">{label.detail}</span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>'''
assert old in s
s = s.replace(old, new, 1)

# Detail panel heading.
old = '''                <h2 id="entry-detail-heading">Entry detail: rank {selectedEntry.rank}</h2>
                <p>{describeStrategy(selectedEntry)}</p>'''
new = '''                <h2 id="entry-detail-heading">
                  Rank {selectedEntry.rank}: {describeStrategy(selectedEntry, catalogById).title}
                </h2>
                <p>{describeStrategy(selectedEntry, catalogById).detail}</p>'''
assert old in s
s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("patched DiscoveryPage names")
