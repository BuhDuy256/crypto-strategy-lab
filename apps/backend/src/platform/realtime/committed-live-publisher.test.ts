// Public seam tests for commit-before-publish and Redis failure semantics.

import type { MarketLiveMessage } from "@crypto-strategy-lab/api-contracts";
import { describe, expect, it } from "vitest";
import { CommittedLivePublisher } from "./committed-live-publisher.js";

const notification: MarketLiveMessage = {
  schemaVersion: "v1", type: "market:live", symbol: "BTCUSDT", timeframe: "5m",
  revisionWatermark: 1, sequence: 1,
  candle: {
    provider: "binance", symbol: "BTCUSDT", timeframe: "5m", openTime: 1,
    closeTime: 2, open: 1, high: 2, low: 1, close: 2, volume: 3, closed: true, revision: 1
  }
};

describe("CommittedLivePublisher", () => {
  it("publishes only after the authoritative commit succeeds", async () => {
    const events: string[] = [];
    const publisher = new CommittedLivePublisher({
      publish: async () => { events.push("publish"); }
    }, { warn: () => undefined });

    const result = await publisher.commitAndPublish(async () => {
      events.push("commit");
      return "stored";
    }, () => notification);

    expect(events).toEqual(["commit", "publish"]);
    expect(result).toEqual({ value: "stored", published: true });
  });

  it("keeps committed state successful when Redis publication is unavailable", async () => {
    const warnings: string[] = [];
    const publisher = new CommittedLivePublisher({
      publish: async () => { throw new Error("redis unavailable"); }
    }, { warn: (message) => warnings.push(message) });

    const result = await publisher.commitAndPublish(async () => "stored", () => notification);

    expect(result).toEqual({ value: "stored", published: false });
    expect(warnings).toEqual([expect.stringContaining("redis unavailable")]);
  });

  it("does not publish when the authoritative commit fails", async () => {
    let published = false;
    const publisher = new CommittedLivePublisher({
      publish: async () => { published = true; }
    }, { warn: () => undefined });

    await expect(publisher.commitAndPublish(async () => {
      throw new Error("commit failed");
    }, () => notification)).rejects.toThrow("commit failed");
    expect(published).toBe(false);
  });
});
