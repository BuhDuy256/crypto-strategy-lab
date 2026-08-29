// Process-lifetime wrapper around live ingest.
//
// The entry command should only start and stop a role, never decide which
// streams that role holds. This runtime owns that decision so the composition
// root stays the single place the stream set is configured.

import type { LiveCandlesRequest } from "./market-data-provider.js";
import type { MarketIngestLogger, MarketLiveIngestService } from "./market-live-ingest-service.js";

export class MarketIngestRuntime {
  constructor(
    private readonly ingest: MarketLiveIngestService,
    private readonly streams: readonly LiveCandlesRequest[],
    private readonly logger: MarketIngestLogger
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    this.logger.log("Market ingest process starting", "MarketIngest");
    try {
      await this.ingest.run(this.streams, signal);
    } finally {
      this.logger.log(
        `Market ingest stopped after ${this.ingest.committedCandles} committed candles ` +
          `and ${this.ingest.attemptedTickPublications} tick publication attempts`,
        "MarketIngest"
      );
    }
  }
}
