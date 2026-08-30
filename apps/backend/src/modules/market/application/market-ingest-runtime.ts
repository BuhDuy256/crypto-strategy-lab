// Process-lifetime wrapper around live ingest.
//
// The entry command should only start and stop a role, never decide which
// streams that role holds or how a disconnect is handled. The stream set is
// configured in the composition root and passed to the supervisor; this runtime
// only starts the supervisor and reports what the process did.

import type { LiveIngestSupervisor } from "./live-ingest-supervisor.js";
import type { MarketIngestLogger, MarketLiveIngestService } from "./market-live-ingest-service.js";

export class MarketIngestRuntime {
  constructor(
    private readonly supervisor: LiveIngestSupervisor,
    private readonly ingest: MarketLiveIngestService,
    private readonly logger: MarketIngestLogger
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    this.logger.log("Market ingest process starting", "MarketIngest");
    try {
      await this.supervisor.run(signal);
    } finally {
      this.logger.log(
        `Market ingest stopped after ${this.ingest.committedCandles} committed candles ` +
          `and ${this.ingest.attemptedTickPublications} tick publication attempts`,
        "MarketIngest"
      );
    }
  }
}
