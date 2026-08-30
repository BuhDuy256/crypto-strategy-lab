// Reconnect delay policy for the live provider connection.
//
// Binance limits an address to 300 connection attempts per 5 minutes, which is
// one per second sustained. A tight retry loop would spend that budget in
// seconds and then be locked out for the rest of the window, so a failing
// connection must back off. The delay grows geometrically and then stops
// growing, because an outage that lasts hours should not push the first retry
// after it ends hours away.
//
// The schedule, from attempt 1: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ... The ceiling
// is 30 seconds and it is a documented part of this slice's contract.

export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_CEILING_MS = 30_000;
const FACTOR = 2;

export interface ReconnectBackoffOptions {
  readonly baseDelayMs?: number;
  readonly ceilingMs?: number;
}

/**
 * Delay before reconnect attempt number `attempt`, counting from 1.
 *
 * Pure, so the schedule can be asserted without waiting for it.
 */
export function reconnectDelayMs(attempt: number, options: ReconnectBackoffOptions = {}): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error(`RECONNECT_ATTEMPT: attempt must be a positive integer, got ${attempt}`);
  }
  const base = options.baseDelayMs ?? RECONNECT_BASE_DELAY_MS;
  const ceiling = options.ceilingMs ?? RECONNECT_CEILING_MS;
  // Cap the exponent before multiplying so a long outage cannot overflow.
  const steps = Math.min(attempt - 1, 32);
  return Math.min(base * FACTOR ** steps, ceiling);
}
