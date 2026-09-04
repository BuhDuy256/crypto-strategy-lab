import { useEffect, useRef, useState } from "react";
import {
  createComposite,
  evaluateComposite,
  getComposite,
  getStrategies,
  listComposites
} from "../api/client.js";
import {
  API_TIMEFRAMES,
  type ApiCompositeCatalogEntry,
  type ApiStrategyDescriptor,
  type ApiTimeframe
} from "@crypto-strategy-lab/api-contracts";
import { GenericParameterForm } from "../components/GenericParameterForm.js";

interface ComponentState {
  uiId: string;
  strategy: ApiStrategyDescriptor;
  parameters: Record<string, string | number | boolean>;
  weight: number;
}

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
}

function toDateInputValue(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function strategyPurpose(strategy: ApiStrategyDescriptor): string {
  const purposes: Readonly<Record<string, string>> = {
    "moving-average": "Follow trend changes by comparing a fast and a slow price average.",
    rsi: "Find momentum extremes that may signal an upcoming reversal.",
    "bollinger-bands": "Compare price with a range that expands and contracts with volatility.",
    "support-resistance": "Find recent price zones where buying or selling pressure appeared.",
    macd: "Track changes in short-term momentum relative to the longer-term trend.",
    "news-sentiment": "Use the latest available crypto-news sentiment as a strategy input."
  };
  return purposes[strategy.id] ?? strategy.description;
}

export function StrategyEnginePage() {
  const nextComponentId = useRef(0);
  const [strategies, setStrategies] = useState<ApiStrategyDescriptor[]>([]);
  const [savedComposites, setSavedComposites] = useState<ApiCompositeCatalogEntry[]>([]);
  const [selectedCompositeId, setSelectedCompositeId] = useState("");
  const [savedCompositeError, setSavedCompositeError] = useState<string | null>(null);
  const [components, setComponents] = useState<ComponentState[]>([]);
  const [policyId, setPolicyId] = useState<"majority-vote" | "weighted-score">("majority-vote");
  const [threshold, setThreshold] = useState<number>(0.5);
  const [timeframe, setTimeframe] = useState<ApiTimeframe>("1h");
  const [startTime, setStartTime] = useState(() => alignToCandleOpen(Date.now() - 30 * 86_400_000, "1h"));
  const [endTime, setEndTime] = useState(() => alignToCandleOpen(Date.now(), "1h"));

  const [compositeName, setCompositeName] = useState("");
  const [compositeDesc, setCompositeDesc] = useState("");

  const [combinedSignal, setCombinedSignal] = useState<string | null>(null);
  const [evaluationState, setEvaluationState] = useState<"idle" | "evaluating" | "success" | "error">("idle");
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationTime, setEvaluationTime] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStrategies().then(res => setStrategies(res.strategies as ApiStrategyDescriptor[])).catch(err => setError(err.message));
    listComposites()
      .then((entries) => {
        setSavedComposites(entries);
        setSelectedCompositeId(entries[0]?.id ?? "");
        setSavedCompositeError(null);
      })
      .catch((loadError: unknown) => {
        setSavedCompositeError(loadError instanceof Error ? loadError.message : String(loadError));
      });
  }, []);

  const selectedComposite = savedComposites.find(
    (composite) => composite.id === selectedCompositeId
  ) ?? null;

  const runEvaluation = async (compositeId: string): Promise<void> => {
    setCombinedSignal(null);
    setEvaluationError(null);
    setEvaluationTime(null);
    setEvaluationState("evaluating");
    try {
      const evaluation = await evaluateComposite(compositeId, {
        provider: "binance",
        symbol: "BTCUSDT",
        timeframe,
        startTime,
        endTime
      });
      setCombinedSignal(evaluation.action);
      setEvaluationTime(evaluation.effectiveTime);
      setEvaluationState("success");
    } catch (evaluationFailure: unknown) {
      const message = evaluationFailure instanceof Error
        ? evaluationFailure.message
        : String(evaluationFailure);
      setEvaluationError(message);
      setEvaluationState("error");
      throw evaluationFailure;
    }
  };

  const addComponent = (strategy: ApiStrategyDescriptor) => {
    setComponents([
      ...components,
      {
        uiId: `component-${nextComponentId.current++}`,
        strategy,
        parameters: {},
        weight: 1
      }
    ]);
  };

  const updateComponent = (uiId: string, updates: Partial<ComponentState>) => {
    setComponents(components.map(c => c.uiId === uiId ? { ...c, ...updates } : c));
  };

  const removeComponent = (uiId: string) => {
    setComponents(components.filter(c => c.uiId !== uiId));
  };

  const handleSave = async () => {
    if (!compositeName.trim()) return setError("Name is required");
    setIsSaving(true);
    setError(null);
    setSaveSuccess(null);
    setCombinedSignal(null);
    setEvaluationError(null);
    setEvaluationTime(null);
    setEvaluationState("idle");
    try {
      const weights: Record<string, number> = {};
      components.forEach((c, i) => {
        weights[`comp-${i}`] = c.weight;
      });

      const res = await createComposite({
        name: compositeName,
        description: compositeDesc,
        components: components.map(c => ({
          id: c.strategy.id,
          version: c.strategy.version,
          parameters: c.parameters
        })),
        policy: {
          id: policyId,
          version: "1.0.0",
          configuration: policyId === "weighted-score" ? { threshold, weights } : {}
        }
      });
      setSaveSuccess(`Saved successfully! ID: ${res.id}`);
      const saved = await getComposite(res.id);
      setSavedComposites((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedCompositeId(saved.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const saveBlockedReason = components.length < 2
    ? "Add at least two strategies to save a composite."
    : compositeName.trim() === ""
      ? "Give the composite a name before saving."
      : null;

  return (
    <section className="strategy-page">
      <div className="strategy-heading">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Strategy Engine</h1>
        <p className="text-gray-400 mt-2 text-lg">Build, combine, and configure algorithms.</p>
      </div>

      <div className="strategy-layout">
        {/* LEFT COLUMN: CATALOG */}
        <aside className="strategy-catalog panel">
          <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Catalog</h2>
            <p className="text-sm text-gray-400 mt-1">Available modules</p>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto p-4 custom-scrollbar bg-gray-900">
            {strategies.length === 0 ? (
              <div className="text-gray-500 text-center py-8 text-sm">Loading strategies...</div>
            ) : (
              strategies.map(s => (
                <article key={s.id} className="strategy-catalog-card">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-blue-400 text-base leading-tight">{s.name}</h3>
                    <span className="strategy-category">{s.category}</span>
                  </div>
                  <p className="strategy-purpose">{strategyPurpose(s)}</p>
                  <p className="strategy-signal"><strong>Signal logic:</strong> {s.description}</p>
                  <button
                    onClick={() => addComponent(s)}
                    className="strategy-add-button"
                  >
                    + ADD STRATEGY
                  </button>
                </article>
              ))
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: BUILDER */}
        <div className="strategy-builder">
          <div className="panel strategy-builder-panel">
            <div className="bg-gray-800 px-8 py-5 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide">Composite Builder</h2>
                <p className="text-sm text-gray-400 mt-1">Configure your selected strategies below</p>
              </div>
              <div className="builder-actions">
                {error && <span className="builder-message builder-message-error">{error}</span>}
                {saveSuccess && <span className="builder-message builder-message-success">{saveSuccess}</span>}
                <button
                  onClick={handleSave}
                  disabled={isSaving || saveBlockedReason !== null}
                  className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded font-bold text-sm tracking-wide transition-colors shadow-lg"
                >
                  {isSaving ? "SAVING..." : "SAVE COMPOSITE"}
                </button>
                {saveBlockedReason !== null && (
                  <span className="builder-save-hint">{saveBlockedReason}</span>
                )}
              </div>
            </div>

            <div className="p-8 flex flex-col gap-8 bg-gray-900">

              {/* TOP SECTION: META DATA */}
              <section className="strategy-section strategy-details">
                <h3 className="text-sm font-bold text-white uppercase mb-4 tracking-wider flex items-center gap-2">
                  <span className="bg-blue-600 w-2 h-2 rounded-full inline-block"></span> Basic Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Composite Name</label>
                    <input
                      type="text"
                      value={compositeName}
                      onChange={e => setCompositeName(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-600 focus:border-blue-500 rounded-lg px-4 py-3 text-sm text-white outline-none transition-all shadow-inner"
                      placeholder="e.g. Alpha Trend 2.0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Description</label>
                    <input
                      type="text"
                      value={compositeDesc}
                      onChange={e => setCompositeDesc(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-600 focus:border-blue-500 rounded-lg px-4 py-3 text-sm text-white outline-none transition-all shadow-inner"
                      placeholder="Describe the strategy logic..."
                    />
                  </div>
                </div>
              </section>

              {/* MIDDLE SECTION: COMPONENTS */}
              <section className="strategy-section strategy-components">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                     <span className="bg-purple-500 w-2 h-2 rounded-full inline-block"></span> Selected Components
                  </h3>
                  {components.length > 0 && (
                    <div className="selected-component-summary">
                      {components.map((c, i) => (
                        <span key={`tag-${c.uiId}`} className="bg-purple-900/40 border border-purple-700 text-purple-300 text-[11px] px-2 py-1 rounded-full font-semibold">
                          #{i+1} {c.strategy.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {components.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-700 rounded-xl bg-gray-800/50">
                    <p className="font-semibold text-lg mb-1">No strategies selected</p>
                    <p className="text-sm">Please select a strategy from the catalog on the left to configure it here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {components.map((c, i) => (
                      <article key={c.uiId} className="strategy-component-card">
                        <button
                          type="button"
                          aria-label={`Remove ${c.strategy.name}`}
                          title="Remove component"
                          onClick={() => removeComponent(c.uiId)}
                          className="component-remove"
                        >×</button>

                        <div className="bg-gray-900/50 p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-gray-700">
                          <span className="inline-block bg-blue-600 text-white font-bold px-2 py-1 rounded text-xs mb-3 shadow">Component #{i + 1}</span>
                          <h4 className="font-bold text-white text-lg leading-tight mb-2">{c.strategy.name}</h4>
                          <p className="text-xs text-gray-400">{c.strategy.description}</p>
                        </div>

                        <div className="p-6 md:w-2/3 flex flex-col gap-6">
                          <div>
                            <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-700 pb-2">Configuration Parameters</h5>
                            <GenericParameterForm
                              schema={c.strategy.parameterSchema}
                              values={c.parameters}
                              onChange={p => updateComponent(c.uiId, { parameters: p })}
                            />
                          </div>

                          {policyId === "weighted-score" && (
                            <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                              <label className="text-xs font-bold text-gray-400 block mb-2">
                                Weight Score
                                <input
                                  type="number"
                                  value={c.weight}
                                  onChange={e => updateComponent(c.uiId, { weight: Number(e.target.value) })}
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono outline-none"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* BOTTOM SECTION: POLICY */}
              <section className="strategy-section strategy-combination">
                <h3 className="text-sm font-bold text-white uppercase mb-4 tracking-wider flex items-center gap-2">
                  <span className="bg-indigo-500 w-2 h-2 rounded-full inline-block"></span> Combination Engine
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Policy</label>
                    <select
                      value={policyId}
                      onChange={e => {
                        const nextPolicy = e.target.value;
                        if (nextPolicy === "majority-vote" || nextPolicy === "weighted-score") {
                          setPolicyId(nextPolicy);
                        }
                      }}
                      className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-medium text-white outline-none"
                    >
                      <option value="majority-vote">Majority Vote</option>
                      <option value="weighted-score">Weighted Score</option>
                    </select>
                  </div>

                  <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Activation Threshold</label>
                    {policyId === "weighted-score" ? (
                      <input
                        type="number"
                        value={threshold}
                        onChange={e => setThreshold(Number(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono text-white outline-none"
                        step="0.1"
                      />
                    ) : (
                      <div className="h-9 flex items-center text-sm text-gray-500 italic">
                        Not required for this policy
                      </div>
                    )}
                  </div>

                </div>
              </section>

            </div>
          </div>

          <section className="panel saved-composites">
            <div className="saved-composites-heading">
              <div>
                <h2>Saved Composites & Evaluation</h2>
                <p>Select a saved definition, choose a market window, then evaluate it.</p>
              </div>
              {selectedComposite !== null && (
                <a
                  className="backtest-link"
                  href={`/backtest?strategyId=${encodeURIComponent(selectedComposite.id)}`}
                >
                  Use in Backtest
                </a>
              )}
            </div>
            {savedCompositeError !== null ? (
              <p role="alert">Could not load saved composites: {savedCompositeError}</p>
            ) : savedComposites.length === 0 ? (
              <p>No saved composites yet.</p>
            ) : (
              <div className="evaluation-workspace">
                <label>
                  Saved composite
                  <select
                    aria-label="Saved composite"
                    value={selectedCompositeId}
                    onChange={(event) => {
                      setSelectedCompositeId(event.target.value);
                      setEvaluationState("idle");
                      setCombinedSignal(null);
                    }}
                  >
                    {savedComposites.map((composite) => (
                      <option key={composite.id} value={composite.id}>{composite.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Evaluation timeframe
                  <select
                    aria-label="Evaluation timeframe"
                    value={timeframe}
                    onChange={(event) => setTimeframe(event.target.value as ApiTimeframe)}
                  >
                    {API_TIMEFRAMES.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Evaluation start
                  <input
                    aria-label="Evaluation start"
                    type="date"
                    value={toDateInputValue(startTime)}
                    onChange={(event) => {
                      const parsed = Date.parse(`${event.target.value}T00:00:00.000Z`);
                      if (Number.isFinite(parsed)) setStartTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
                <label>
                  Evaluation end
                  <input
                    aria-label="Evaluation end"
                    type="date"
                    value={toDateInputValue(endTime)}
                    onChange={(event) => {
                      const parsed = Date.parse(`${event.target.value}T23:59:59.999Z`);
                      if (Number.isFinite(parsed)) setEndTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
                {selectedComposite !== null && (
                  <div className="saved-composite-summary">
                    <span>{selectedComposite.components.length} components</span>
                    <span>{selectedComposite.policy.id}</span>
                    <span>{selectedComposite.version}</span>
                    <p>{selectedComposite.components.map((component) => component.id).join(" + ")}</p>
                  </div>
                )}
                <button
                  type="button"
                  disabled={selectedComposite === null || evaluationState === "evaluating"}
                  onClick={() => {
                    if (selectedComposite !== null) {
                      void runEvaluation(selectedComposite.id).catch(() => undefined);
                    }
                  }}
                >
                  {evaluationState === "evaluating" ? "Evaluating..." : "Evaluate selected"}
                </button>
                {evaluationState !== "idle" && (
                  <div className={`combined-output combined-output-${evaluationState}`}>
                    <span className="combined-output-label">Latest combined signal</span>
                    {evaluationState === "evaluating" ? (
                      <strong>Evaluating...</strong>
                    ) : evaluationState === "error" ? (
                      <><strong>Evaluation failed</strong><small>{evaluationError}</small></>
                    ) : (
                      <>
                        <strong className={`combined-signal combined-signal-${combinedSignal}`}>
                          {combinedSignal}
                        </strong>
                        {evaluationTime !== null && <small>At {new Date(evaluationTime).toLocaleString()}</small>}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
