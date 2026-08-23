// Deterministic JSON serialization and SHA-256 hashing for immutable provenance.

import { createHash } from "node:crypto";

function serialize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`CANONICAL_JSON_NUMBER: expected a finite number, got ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`CANONICAL_JSON_TYPE: unsupported ${typeof value} value`);
}

export function canonicalJson(value: unknown): string {
  return serialize(value);
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
