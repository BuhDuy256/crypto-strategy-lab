// News-owned liveness port for the normal collection and analysis worker process.
// It is independent of provider collection so an in-flight RSS request never makes
// the API confuse a live worker with a stopped one.

export const NEWS_COLLECTION_WORKER_ID = "news-worker";

export interface NewsWorkerHeartbeat {
  start(): Promise<void>;
  stop(): void;
}
