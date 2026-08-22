import { describe, expect, it } from "vitest";
import { isHealthResponse, type HealthResponse } from "./index.js";

describe("HealthResponse", () => {
  it("accepts a well-formed health response", () => {
    const value: HealthResponse = { status: "ok" };
    expect(isHealthResponse(value)).toBe(true);
  });

  it("rejects null, non-objects, and objects with the wrong status", () => {
    expect(isHealthResponse(null)).toBe(false);
    expect(isHealthResponse(undefined)).toBe(false);
    expect(isHealthResponse("ok")).toBe(false);
    expect(isHealthResponse({ status: "down" })).toBe(false);
    expect(isHealthResponse({})).toBe(false);
  });
});
