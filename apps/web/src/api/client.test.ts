import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiContractError, getHealth } from "./client.js";

describe("getHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed health response on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok" })
      }))
    );

    await expect(getHealth()).resolves.toEqual({ status: "ok" });
  });

  it("throws when the backend responds with a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({})
      }))
    );

    await expect(getHealth()).rejects.toThrow(/503/);
  });

  it("throws ApiContractError when the response body does not match the contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: "shape" })
      }))
    );

    await expect(getHealth()).rejects.toBeInstanceOf(ApiContractError);
  });
});
