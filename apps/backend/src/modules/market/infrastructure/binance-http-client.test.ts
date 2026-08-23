// Verifies that the fetch wrapper preserves status and body even for non-JSON errors.
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchBinanceHttpClient } from "./binance-http-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FetchBinanceHttpClient", () => {
  it("preserves a non-JSON rate-limit response for adapter backoff", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "2" }
        })
      )
    );

    await expect(
      new FetchBinanceHttpClient().get(new URL("https://data-api.binance.vision/api/v3/klines"))
    ).resolves.toMatchObject({
      status: 429,
      body: "rate limited"
    });
  });
});
