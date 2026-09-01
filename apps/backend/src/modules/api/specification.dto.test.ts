// Transport validation for the optional, explicit NEWS-06 sentiment input.

import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateSpecificationDto } from "./specification.dto.js";

const base = {
  schemaVersion: "v1",
  dataset: { provider: "binance", symbol: "BTCUSDT", timeframe: "1h", startTime: 0, endTime: 3_600_000 },
  strategy: {
    id: "news-sentiment", version: "1.0.0",
    parameters: { positiveThreshold: 0.2, negativeThreshold: -0.2, windowDurationMs: 3_600_000 }
  }
};

describe("CreateSpecificationDto sentiment input", () => {
  it("accepts a complete explicit substitute/degrade policy", async () => {
    const value = plainToInstance(CreateSpecificationDto, {
      ...base,
      sentimentInput: {
        windowDurationMs: 3_600_000,
        policy: {
          maxAgeMs: 300_000,
          onMissing: { action: "substitute", substituteValue: 0 },
          onStale: { action: "degrade" }
        }
      }
    });

    await expect(validate(value, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it("rejects a substitute policy without its explicit replacement value", async () => {
    const value = plainToInstance(CreateSpecificationDto, {
      ...base,
      sentimentInput: {
        windowDurationMs: 3_600_000,
        policy: {
          maxAgeMs: 300_000,
          onMissing: { action: "substitute" },
          onStale: { action: "block" }
        }
      }
    });

    await expect(validate(value, { whitelist: true, forbidNonWhitelisted: true })).resolves.not.toEqual([]);
  });

  it("rejects a sentiment input without its required policy object", async () => {
    const value = plainToInstance(CreateSpecificationDto, {
      ...base,
      sentimentInput: { windowDurationMs: 3_600_000 }
    });

    await expect(validate(value, { whitelist: true, forbidNonWhitelisted: true })).resolves.not.toEqual([]);
  });

  it("rejects a policy with either required action object missing", async () => {
    const value = plainToInstance(CreateSpecificationDto, {
      ...base,
      sentimentInput: {
        windowDurationMs: 3_600_000,
        policy: { maxAgeMs: 300_000, onMissing: { action: "block" } }
      }
    });

    await expect(validate(value, { whitelist: true, forbidNonWhitelisted: true })).resolves.not.toEqual([]);
  });

  it("rejects null rather than treating it as an omitted optional sentiment input", async () => {
    const value = plainToInstance(CreateSpecificationDto, { ...base, sentimentInput: null });

    await expect(validate(value, { whitelist: true, forbidNonWhitelisted: true })).resolves.not.toEqual([]);
  });
});
