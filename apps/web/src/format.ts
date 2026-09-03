// Presentation formatting only.
//
// Every value here already came from the backend, which owns the arithmetic.
// These helpers turn a machine representation into a human one and nothing
// else: they never derive a metric, re-rank anything, or change a stored value.
// A ratio stays the same ratio; it is only written as a percentage.
//
// All calendar formatting is UTC on purpose. Dataset windows, candle open
// times, and trade timestamps are all UTC in this system, so rendering them in
// the viewer's local zone would make the screen disagree with the data.

const UTC = "UTC";

/** Ratio to percent: `0.375` becomes `37.5%`, `-0.0165446` becomes `-1.65%`. */
export function formatPercent(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "-";
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value * 100);
  return `${formatted}%`;
}

/** A price, fee, or cash amount: `79620.17` becomes `79,620.17`. */
export function formatMoney(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

/** A plain number with thousands separators and a capped precision. */
export function formatNumber(value: number, maximumFractionDigits = 4): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

/** A calendar day in UTC: `Aug 29, 2026`. */
export function formatDate(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: UTC,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(epochMs));
}

/** A day and time in UTC, without the year: `Aug 29, 15:00`. */
export function formatDateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return "-";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: UTC,
    month: "short",
    day: "numeric"
  }).format(new Date(epochMs));
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: UTC,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(epochMs));
  return `${day}, ${time}`;
}

/**
 * Shortens an identifier so it stops competing with the numbers around it:
 * `309f9243...9fbe96`. Anything already short is returned unchanged, so a
 * reader never sees an ellipsis that hides nothing.
 */
export function truncateHash(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Epoch milliseconds to the `YYYY-MM-DD` a `type="date"` input expects (UTC). */
export function toDateInputValue(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * A `type="date"` value back to epoch milliseconds, at the start or the end of
 * that UTC day. Returns `null` for an incomplete or invalid entry, so a caller
 * can leave the current value alone while the user is still typing.
 */
export function fromDateInputValue(value: string, edge: "start" | "end"): number | null {
  const suffix = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const parsed = Date.parse(`${value}${suffix}`);
  return Number.isFinite(parsed) ? parsed : null;
}
