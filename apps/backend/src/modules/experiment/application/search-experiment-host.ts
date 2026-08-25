// Hosts search-coordinator loops inside the API process (the accepted V3 topology).
//
// Starting a search records durable intent and launches a background loop. The
// loop is not the source of truth: run state lives in PostgreSQL, so losing the
// process loses no progress. On process start the host resumes every experiment
// still marked running, which is what makes a coordinator restart recover.

import type { SearchCoordinator, SearchProgress } from "./search-coordinator.js";

export interface SearchHostLogger {
  log(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

const silentLogger: SearchHostLogger = { log: () => undefined, error: () => undefined };

export class SearchExperimentHost {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly coordinator: SearchCoordinator,
    private readonly logger: SearchHostLogger = silentLogger
  ) {}

  // Start a new search: record durable intent, then drive it in the background.
  async begin(specId: string, correlationId: string): Promise<SearchProgress> {
    await this.coordinator.start(specId, correlationId);
    this.launch(specId);
    return this.coordinator.progress(specId);
  }

  progress(specId: string): Promise<SearchProgress> {
    return this.coordinator.progress(specId);
  }

  // Resume every experiment still marked running in durable state.
  async resumeAll(): Promise<void> {
    const running = await this.coordinator.listRunning();
    for (const specId of running) {
      this.launch(specId);
    }
    if (running.length > 0) {
      this.logger.log(`Resumed ${running.length} running search experiment(s)`, "SearchExperimentHost");
    }
  }

  // Stop driving all loops. Durable state is untouched, so a later start resumes.
  stopAll(): void {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
  }

  private launch(specId: string): void {
    if (this.controllers.has(specId)) {
      return;
    }
    const controller = new AbortController();
    this.controllers.set(specId, controller);
    void this.coordinator
      .runToCompletion(specId, controller.signal)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown search loop failure";
        this.logger.error(message, `search=${specId}`);
      })
      .finally(() => {
        this.controllers.delete(specId);
      });
  }
}
