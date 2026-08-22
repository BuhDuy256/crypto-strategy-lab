import { describe, expect, it } from "vitest";
import { buildLogRecord, formatLogRecord } from "./logger.js";

describe("buildLogRecord", () => {
  it("includes timestamp, level, process role, and request id", () => {
    const record = buildLogRecord("log", "hello", "api", "req-123");

    expect(record.level).toBe("log");
    expect(record.processRole).toBe("api");
    expect(record.requestId).toBe("req-123");
    expect(record.message).toBe("hello");
    expect(() => new Date(record.timestamp).toISOString()).not.toThrow();
  });

  it("uses a null request id when none is available", () => {
    const record = buildLogRecord("warn", "no request", "api", null);

    expect(record.requestId).toBeNull();
  });
});

describe("formatLogRecord", () => {
  const record = buildLogRecord("error", "boom", "api", "req-abc", "Bootstrap");

  it("renders raw parsable JSON when pretty is false", () => {
    const line = formatLogRecord(record, false);
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.level).toBe("error");
    expect(parsed.processRole).toBe("api");
    expect(parsed.requestId).toBe("req-abc");
    expect(parsed.message).toBe("boom");
    expect(parsed.context).toBe("Bootstrap");
  });

  it("renders human-readable text when pretty is true", () => {
    const line = formatLogRecord(record, true);

    expect(line).toContain("ERROR");
    expect(line).toContain("api");
    expect(line).toContain("request=req-abc");
    expect(line).toContain("[Bootstrap]");
    expect(line).toContain("boom");
  });
});
