// Per-request context propagation.
//
// A request identifier is set once per inbound HTTP request (see
// request-id.middleware.ts) and must be readable by the logger anywhere
// during that request's async call chain, without threading it through
// every function signature. Node's AsyncLocalStorage provides exactly
// that: a context that follows the request's async execution.

import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `requestId` available to `getRequestId()` for its whole async chain. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** Returns the current request's identifier, or `undefined` outside a request context. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
