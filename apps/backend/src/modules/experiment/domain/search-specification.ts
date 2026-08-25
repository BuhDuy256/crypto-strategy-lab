// Search fields carried on an experiment specification. Their presence turns a
// single-backtest experiment into an automated search: the coordinator asks the
// named generator for candidates, derives a per-candidate specification from the
// same dataset, execution model, and metric set, submits each through the backtest
// executor, ranks completed candidates with the named ranking policy, and stops
// when a configured stop condition is met.
//
// These are configuration on the frozen specification, not hidden defaults, so a
// changed weight or window is a recorded change and never silently reinterprets a
// past run (baseline reproducibility rule).

import type { SearchSpace, VersionedRef } from "../../strategy/index.js";

// The three stop conditions from the official source, section 23. Each is
// optional; at least one must be present so a run cannot loop without control.
export interface SearchStopConditions {
  // Stop once this many candidates have been submitted.
  readonly maxCandidates?: number;
  // Stop once the run has been active for this many milliseconds.
  readonly maxDurationMs?: number;
  // Stop once this many consecutive candidate outcomes fail to improve the best
  // ranking score.
  readonly noImprovementIterations?: number;
}

export interface SearchConfiguration {
  readonly generator: VersionedRef;
  readonly generatorConfiguration: Record<string, unknown>;
  readonly searchSpace: SearchSpace;
  readonly seed: number | string;
  readonly rankingPolicy: VersionedRef;
  readonly rankingConfiguration: Record<string, unknown>;
  readonly stopConditions: SearchStopConditions;
  // Backpressure bound: the coordinator waits rather than submitting more work
  // while this many candidates are still queued or running.
  readonly maxInFlight: number;
}
