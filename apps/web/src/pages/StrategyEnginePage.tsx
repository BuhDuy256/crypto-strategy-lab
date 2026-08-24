import { useEffect, useState } from "react";
import { getStrategies, createComposite, evaluatePolicy } from "../api/client.js";
import type { ApiStrategyDescriptor } from "@crypto-strategy-lab/api-contracts";
import { GenericParameterForm } from "../components/GenericParameterForm.js";

interface ComponentState {
  uiId: string;
  strategy: ApiStrategyDescriptor;
  parameters: Record<string, any>;
  mockSignal: "buy" | "sell" | "hold";
  weight: number;
}

export function StrategyEnginePage() {
  const [strategies, setStrategies] = useState<ApiStrategyDescriptor[]>([]);
  const [components, setComponents] = useState<ComponentState[]>([]);
  const [policyId, setPolicyId] = useState<"majority-vote" | "weighted-score">("majority-vote");
  const [threshold, setThreshold] = useState<number>(0.5);
  
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
        uiId: `comp-${Date.now()}`,
        strategy,
        parameters: {},
        mockSignal: "hold",
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

  useEffect(() => {
    if (components.length === 0) {
      setCombinedSignal(null);
      return;
    }
    const weights: Record<string, number> = {};
    components.forEach((c, i) => {
      weights[`comp-${i}`] = c.weight;
    });

    const configuration = policyId === "weighted-score" ? { threshold, weights } : {};
    
    evaluatePolicy({
      policy: { id: policyId, version: "1.0.0", configuration },
      signals: components.map(c => c.mockSignal)
    }).then(res => {
      setCombinedSignal(res.action);
    }).catch(() => {
      setCombinedSignal("Error");
    });
  }, [components, policyId, threshold]);

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto min-h-screen bg-gray-950 flex flex-col font-sans">
      <div className="flex flex-col mb-8 border-b border-gray-800 pb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Strategy Engine</h1>
        <p className="text-gray-400 mt-2 text-lg">Build, combine, and configure algorithms.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 flex-1">
        {/* LEFT COLUMN: CATALOG */}
        <div className="lg:col-span-1 flex flex-col bg-gray-900 border-2 border-gray-800 rounded-xl shadow-xl overflow-hidden h-fit max-h-[85vh]">
          <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Catalog</h2>
            <p className="text-sm text-gray-400 mt-1">Available modules</p>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto p-4 custom-scrollbar bg-gray-900">
            {strategies.length === 0 ? (
              <div className="text-gray-500 text-center py-8 text-sm">Loading strategies...</div>
            ) : (
              strategies.map(s => (
                <div key={s.id} className="bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-xl p-4 transition-all shadow-md group flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-blue-400 text-base leading-tight">{s.name}</h3>
                    <span className="text-[10px] uppercase font-bold bg-blue-900/50 text-blue-300 border border-blue-700 px-2 py-1 rounded">{s.category}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4 leading-relaxed flex-1">{s.description}</p>
                  <button 
                    onClick={() => addComponent(s)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2 rounded shadow transition-all"
                  >
                    + ADD STRATEGY
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: BUILDER */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-gray-900 border-2 border-gray-800 rounded-xl shadow-xl flex flex-col overflow-hidden">
            <div className="bg-gray-800 px-8 py-5 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide">Composite Builder</h2>
                <p className="text-sm text-gray-400 mt-1">Configure your selected strategies below</p>
              </div>
              <div className="flex items-center gap-4">
                {error && <span className="text-red-400 text-sm bg-red-950 px-3 py-1 rounded border border-red-900 font-medium">{error}</span>}
                {saveSuccess && <span className="text-green-400 text-sm bg-green-950 px-3 py-1 rounded border border-green-900 font-medium">{saveSuccess}</span>}
                <button 
                  onClick={handleSave}
                  disabled={isSaving || components.length === 0}
                  className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded font-bold text-sm tracking-wide transition-colors shadow-lg"
                >
                  {isSaving ? "SAVING..." : "SAVE COMPOSITE"}
                </button>
              </div>
            </div>
            
            <div className="p-8 flex flex-col gap-8 bg-gray-900">
              
              {/* TOP SECTION: META DATA */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-sm">
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
              </div>

              {/* MIDDLE SECTION: COMPONENTS */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                     <span className="bg-purple-500 w-2 h-2 rounded-full inline-block"></span> Selected Components
                  </h3>
                  {components.length > 0 && (
                    <div className="flex flex-wrap gap-2 ml-2">
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
                      <div key={c.uiId} className="bg-gray-800 border-2 border-gray-600 rounded-xl shadow-lg flex flex-col md:flex-row overflow-hidden relative">
                        <button onClick={() => removeComponent(c.uiId)} className="absolute top-4 right-4 text-gray-500 hover:text-red-400 text-xl font-bold p-1 bg-gray-900 rounded-full w-8 h-8 flex items-center justify-center transition-colors">✕</button>
                        
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
                          
                          <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                            <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Simulation Options</h5>
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <label className="text-xs font-bold text-gray-400 block mb-2">Simulated Output</label>
                                <select 
                                  value={c.mockSignal} 
                                  onChange={e => updateComponent(c.uiId, { mockSignal: e.target.value as any })}
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-semibold text-white outline-none"
                                >
                                  <option value="buy">BUY</option>
                                  <option value="sell">SELL</option>
                                  <option value="hold">HOLD</option>
                                </select>
                              </div>
                              
                              {policyId === "weighted-score" && (
                                <div>
                                  <label className="text-xs font-bold text-gray-400 block mb-2">Weight Score</label>
                                  <input 
                                    type="number" 
                                    value={c.weight}
                                    onChange={e => updateComponent(c.uiId, { weight: Number(e.target.value) })}
                                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono outline-none"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BOTTOM SECTION: POLICY */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-white uppercase mb-4 tracking-wider flex items-center gap-2">
                  <span className="bg-indigo-500 w-2 h-2 rounded-full inline-block"></span> Combination Engine
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Policy</label>
                    <select 
                      value={policyId} 
                      onChange={e => setPolicyId(e.target.value as any)}
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

                  <div className="bg-blue-900/20 p-4 rounded-lg border-2 border-blue-500/50 shadow-inner flex flex-col justify-center items-center">
                    <span className="text-[11px] font-bold text-blue-300 uppercase tracking-widest mb-1">Combined Output</span>
                    {components.length === 0 ? (
                      <span className="text-gray-500 font-mono">-</span>
                    ) : (
                      <span className={`font-extrabold text-2xl tracking-widest uppercase drop-shadow-md ${
                        combinedSignal === 'buy' ? 'text-green-400' : 
                        combinedSignal === 'sell' ? 'text-red-400' : 
                        'text-gray-300'
                      }`}>
                        {combinedSignal || "N/A"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
