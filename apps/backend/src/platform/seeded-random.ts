// Deterministic, seeded pseudo-random source.
//
// A single seed (a number or a string) fully determines the sequence, so any
// consumer that only draws from this source is reproducible: the same seed
// yields the same sequence in any process. It is intentionally small and pure
// (no global state, no crypto) because it feeds reproducible search, not
// security. The algorithm is mulberry32; string seeds are folded to a uint32
// with FNV-1a first.

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    // 32-bit FNV prime multiply, kept in uint32 range.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seedToUint32(seed: number | string): number {
  if (typeof seed === "string") {
    return fnv1a(seed);
  }
  if (!Number.isFinite(seed)) {
    throw new Error(`SEEDED_RANDOM_SEED: numeric seed must be finite, got ${String(seed)}`);
  }
  // Fold the integer part into a uint32 so any finite number is a valid seed.
  return Math.abs(Math.trunc(seed)) >>> 0;
}

export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    // Offset so a zero seed still produces a usable stream.
    this.state = (seedToUint32(seed) + 0x9e3779b9) >>> 0;
  }

  // Next float in [0, 1). mulberry32.
  nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Integer in [minInclusive, maxInclusive].
  nextInt(minInclusive: number, maxInclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
      throw new Error("SEEDED_RANDOM_RANGE: nextInt bounds must be integers");
    }
    if (maxInclusive < minInclusive) {
      throw new Error("SEEDED_RANDOM_RANGE: max must not be less than min");
    }
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.nextFloat() * span);
  }

  // One item from a non-empty list.
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("SEEDED_RANDOM_PICK: cannot pick from an empty list");
    }
    return items[this.nextInt(0, items.length - 1)]!;
  }

  // `count` distinct items, in draw order, without replacement.
  sample<T>(items: readonly T[], count: number): T[] {
    if (count < 0 || !Number.isInteger(count)) {
      throw new Error("SEEDED_RANDOM_SAMPLE: count must be a non-negative integer");
    }
    if (count > items.length) {
      throw new Error("SEEDED_RANDOM_SAMPLE: count must not exceed the list length");
    }
    const pool = [...items];
    const chosen: T[] = [];
    for (let index = 0; index < count; index += 1) {
      const at = this.nextInt(0, pool.length - 1);
      chosen.push(pool[at]!);
      pool.splice(at, 1);
    }
    return chosen;
  }
}
