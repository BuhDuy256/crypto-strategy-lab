// Public Experiment read port for one result's reproducibility checklist. It
// returns the full checklist recorded at acceptance in a single response,
// resolving the baseline's ten-item list. It performs no calculation; the
// checklist is read exactly as the result-acceptance transaction stored it.

import type { ProvenanceResponse } from "@crypto-strategy-lab/api-contracts";

export abstract class ProvenanceQuery {
  // Returns the checklist for the completed result of `runId`, or undefined when
  // the run has no accepted result yet (pending, failed, or unknown), so the
  // transport can answer with a clear client error.
  abstract getProvenance(runId: string): Promise<ProvenanceResponse | undefined>;
}
