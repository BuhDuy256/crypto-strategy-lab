import { describe, expect, it } from "vitest";
import { resolveRequestId } from "./request-id.middleware.js";

describe("resolveRequestId", () => {
  it("keeps an inbound request id when one is present", () => {
    expect(resolveRequestId("inbound-id")).toBe("inbound-id");
  });

  it("uses the first value when the header is repeated", () => {
    expect(resolveRequestId(["first-id", "second-id"])).toBe("first-id");
  });

  it("generates a new id when the header is absent", () => {
    const generated = resolveRequestId(undefined, () => "generated-id");

    expect(generated).toBe("generated-id");
  });

  it("generates a new id when the header is blank", () => {
    const generated = resolveRequestId("   ", () => "generated-id");

    expect(generated).toBe("generated-id");
  });
});
