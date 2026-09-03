// The Strategy Engine page (UI-02): pick strategies from the catalog, configure
// each one, choose how their signals combine, and save the result as a reusable
// composite.
//
// The page holds no combination logic. It collects choices and posts them; the
// backend validates the components, owns the policy semantics, and produces the
// evaluated action shown after a save.

import { useEffect, useRef, useState } from "react";
import { createComposite, evaluateComposite, getStrategies } from "../api/client.js";
import {
  API_TIMEFRAMES,
  type ApiStrategyDescriptor,
  type ApiTimeframe
} from "@crypto-strategy-lab/api-contracts";
import { GenericParameterForm } from "../components/GenericParameterForm.js";
import { fromDateInputValue, toDateInputValue } from "../format.js";

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

/** A dataset window is addressed by candle open times, so bounds are snapped. */
function alignToCandleOpen(epochMs: number, timeframe: ApiTimeframe): number {
  const duration = TIMEFRAME_MILLISECONDS[timeframe];
  return Math.floor(epochMs / duration) * duration;
}

/** The minimum a composite needs before the backend will accept it. */
const MINIMUM_COMPONENTS = 2;

export function StrategyEnginePage() {
  const nextComponentId = useRef(0);
  const [strategies, setStrategies] = useState<ApiStrategyDescriptor[]>([]);
  const [components, setComponents] = useState<ComponentState[]>([]);
  const [policyId, setPolicyId] = useState<"majority-vote" | "weighted-score">("majority-vote");
  const [threshold, setThreshold] = useState<number>(0.5);
  const [timeframe, setTimeframe] = useState<ApiTimeframe>("1h");
  const [startTime, setStartTime] = useState(() => alignToCandleOpen(Date.now() - 30 * 86_400_000, "1h"));
  const [endTime, setEndTime] = useState(() => alignToCandleOpen(Date.now(), "1h"));

  const [compositeName, setCompositeName] = useState("");
  const [compositeDesc, setCompositeDesc] = useState("");

  const [combinedSignal, setCombinedSignal] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStrategies().then(res => setStrategies(res.strategies as ApiStrategyDescriptor[])).catch(err => setError(err.message));
  }, []);

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
    if (!compositeName) return setError("Name is required");
    setIsSaving(true);
    setError(null);
    setSaveSuccess(null);
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
      try {
        const evaluation = await evaluateComposite(res.id, {
          provider: "binance",
          symbol: "BTCUSDT",
          timeframe,
          startTime,
          endTime
        });
        setCombinedSignal(evaluation.action);
      } catch (evaluationError: unknown) {
        setError(
          `Composite saved, but evaluation failed: ${
            evaluationError instanceof Error ? evaluationError.message : String(evaluationError)
          }`
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const missingName = compositeName.trim() === "";
  const missingComponents = components.length < MINIMUM_COMPONENTS;
  const saveBlockedReason = missingComponents
    ? `Add at least ${MINIMUM_COMPONENTS} strategies from the catalog to save a composite.`
    : missingName
      ? "Give the composite a name to save it."
      : null;

  return (
    <section className="engine-page">
      <div className="page-heading">
        <div>
          <h1>Strategy Engine</h1>
          <p>Build reusable strategy combinations, then use them in Backtest and Discovery.</p>
        </div>
      </div>

      <div className="engine-layout">
        <section className="panel catalog-panel" aria-labelledby="catalog-heading">
          <header className="panel-header">
            <div>
              <h2 id="catalog-heading">Strategy catalog</h2>
              <p>Pick the building blocks</p>
            </div>
            <span className="pill">{strategies.length}</span>
          </header>
          <div className="catalog-list">
            {strategies.length === 0 ? (
              <p className="empty-note">Loading strategies...</p>
            ) : (
              strategies.map(s => {
                const used = components.filter(c => c.strategy.id === s.id).length;
                return (
                  <article
                    key={s.id}
                    className={used > 0 ? "catalog-item is-selected" : "catalog-item"}
                  >
                    <div className="catalog-item-title">
                      <h3>{s.name}</h3>
                      <span className="badge">{s.category}</span>
                    </div>
                    <p className="catalog-item-description">{s.description}</p>
                    <div className="catalog-item-actions">
                      <button type="button" className="button-primary" onClick={() => addComponent(s)}>
                        + ADD STRATEGY
                      </button>
                      {used > 0 && <span className="catalog-item-count">Added ×{used}</span>}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="panel builder-panel" aria-labelledby="builder-heading">
          <header className="panel-header">
            <div>
              <h2 id="builder-heading">Composite builder</h2>
              <p>Name it, configure the components, choose how their signals combine</p>
            </div>
            <div className="builder-save">
              <button
                type="button"
                className="button-accent"
                onClick={handleSave}
                disabled={isSaving || missingComponents}
              >
                {isSaving ? "SAVING..." : "SAVE COMPOSITE"}
              </button>
              {saveBlockedReason !== null && <span className="hint">{saveBlockedReason}</span>}
            </div>
          </header>

          {(error !== null || saveSuccess !== null) && (
            <div className="builder-messages">
              {error !== null && <p className="banner banner-error" role="alert">{error}</p>}
              {saveSuccess !== null && <p className="banner banner-success" role="status">{saveSuccess}</p>}
            </div>
          )}

          <div className="panel-body">
            <section className="form-section">
              <h3 className="section-title"><span className="step">1</span> Details</h3>
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">Composite name</span>
                  <input
                    type="text"
                    value={compositeName}
                    onChange={e => setCompositeName(e.target.value)}
                    placeholder="e.g. Alpha Trend 2.0"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Description</span>
                  <input
                    type="text"
                    value={compositeDesc}
                    onChange={e => setCompositeDesc(e.target.value)}
                    placeholder="Describe the strategy logic..."
                  />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3 className="section-title">
                <span className="step">2</span> Selected components
                <span className="section-count">{components.length}</span>
              </h3>

              {components.length === 0 ? (
                <p className="empty-state">
                  No strategies selected yet. Add at least {MINIMUM_COMPONENTS} from the catalog on
                  the left.
                </p>
              ) : (
                <div className="component-list">
                  {components.map((c, i) => (
                    <article key={c.uiId} className="component-card">
                      <div className="component-identity">
                        <span className="badge badge-accent">Component #{i + 1}</span>
                        <h4>{c.strategy.name}</h4>
                        <p>{c.strategy.description}</p>
                        <button
                          type="button"
                          className="button-quiet"
                          onClick={() => removeComponent(c.uiId)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="component-configuration">
                        <h5 className="subsection-title">Parameters</h5>
                        <GenericParameterForm
                          schema={c.strategy.parameterSchema}
                          values={c.parameters}
                          onChange={p => updateComponent(c.uiId, { parameters: p })}
                        />
                        {policyId === "weighted-score" && (
                          <label className="field weight-field">
                            <span className="field-label">Weight</span>
                            <input
                              type="number"
                              value={c.weight}
                              onChange={e => updateComponent(c.uiId, { weight: Number(e.target.value) })}
                            />
                          </label>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="form-section">
              <h3 className="section-title"><span className="step">3</span> Combination policy</h3>
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">Policy</span>
                  <select
                    value={policyId}
                    onChange={e => {
                      const nextPolicy = e.target.value;
                      if (nextPolicy === "majority-vote" || nextPolicy === "weighted-score") {
                        setPolicyId(nextPolicy);
                      }
                    }}
                  >
                    <option value="majority-vote">Majority Vote</option>
                    <option value="weighted-score">Weighted Score</option>
                  </select>
                  <span className="field-hint">
                    {policyId === "majority-vote"
                      ? "The action most components agree on wins."
                      : "Component weights are summed and compared to the threshold."}
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Activation threshold</span>
                  {policyId === "weighted-score" ? (
                    <input
                      type="number"
                      value={threshold}
                      onChange={e => setThreshold(Number(e.target.value))}
                      step="0.1"
                    />
                  ) : (
                    <span className="field-inert">Not used by Majority Vote</span>
                  )}
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3 className="section-title"><span className="step">4</span> Evaluation window</h3>
              <p className="section-note">
                After saving, the backend evaluates the composite once over this window and returns
                its combined action.
              </p>
              <div className="field-grid field-grid-3">
                <label className="field">
                  <span className="field-label">Evaluation timeframe</span>
                  <select
                    value={timeframe}
                    onChange={e => setTimeframe(e.target.value as ApiTimeframe)}
                  >
                    {API_TIMEFRAMES.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Evaluation start</span>
                  <input
                    type="date"
                    aria-label="Evaluation start"
                    value={toDateInputValue(startTime)}
                    onChange={e => {
                      const parsed = fromDateInputValue(e.target.value, "start");
                      if (parsed !== null) setStartTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Evaluation end</span>
                  <input
                    type="date"
                    aria-label="Evaluation end"
                    value={toDateInputValue(endTime)}
                    onChange={e => {
                      const parsed = fromDateInputValue(e.target.value, "end");
                      if (parsed !== null) setEndTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
              </div>

              <div className="combined-output" data-signal={combinedSignal ?? "none"}>
                <span className="combined-output-label">Combined action</span>
                <span className="combined-output-value">{combinedSignal ?? "Not evaluated yet"}</span>
              </div>
            </section>
          </div>
        </section>
      </div>
    </section>
  );
}
