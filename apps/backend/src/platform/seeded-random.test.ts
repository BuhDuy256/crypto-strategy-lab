// Determinism and range tests for the seeded pseudo-random source.

import { describe, expect, it } from "vitest";
import { SeededRandom } from "./seeded-random.js";

function floats(seed: number | string, count: number): number[] {
  const random = new SeededRandom(seed);
  return Array.from({ length: count }, () => random.nextFloat());
}

describe("SeededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    expect(floats(123, 5)).toEqual(floats(123, 5));
  });

  it("produces different sequences for different seeds", () => {
    expect(floats(1, 8)).not.toEqual(floats(2, 8));
  });

  it("accepts a string seed and stays deterministic", () => {
    expect(floats("alpha", 5)).toEqual(floats("alpha", 5));
    expect(floats("alpha", 8)).not.toEqual(floats("beta", 8));
  });

  it("keeps every float in the [0, 1) range", () => {
    const random = new SeededRandom(42);
    for (let i = 0; i < 1000; i += 1) {
      const value = random.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("keeps nextInt within the inclusive bounds", () => {
    const random = new SeededRandom("ints");
    for (let i = 0; i < 1000; i += 1) {
      const value = random.nextInt(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("returns the only value when nextInt bounds are equal", () => {
    const random = new SeededRandom(5);
    expect(random.nextInt(4, 4)).toBe(4);
  });

  it("rejects an inverted nextInt range", () => {
    const random = new SeededRandom(5);
    expect(() => random.nextInt(9, 2)).toThrow(/SEEDED_RANDOM_RANGE/);
  });

  it("samples distinct items without replacement", () => {
    const random = new SeededRandom("sample");
    const chosen = random.sample(["a", "b", "c", "d"], 3);
    expect(chosen).toHaveLength(3);
    expect(new Set(chosen).size).toBe(3);
    for (const item of chosen) {
      expect(["a", "b", "c", "d"]).toContain(item);
    }
  });

  it("rejects a sample larger than the list", () => {
    const random = new SeededRandom(1);
    expect(() => random.sample(["a", "b"], 3)).toThrow(/SEEDED_RANDOM_SAMPLE/);
  });

  it("rejects a pick from an empty list", () => {
    const random = new SeededRandom(1);
    expect(() => random.pick([])).toThrow(/SEEDED_RANDOM_PICK/);
  });
});
