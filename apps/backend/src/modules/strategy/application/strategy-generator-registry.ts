// Startup-assembled registry of strategy generators. The generator catalog is
// derived from these descriptors, exactly as the strategy catalog is derived
// from strategy descriptors, so a new generator appears with no consumer change.

import type { GeneratorDescriptor, StrategyGenerator } from "../domain/strategy-generator.js";

export interface GeneratorRef {
  readonly id: string;
  readonly version: string;
}

function keyOf(ref: GeneratorRef): string {
  return `${ref.id}@${ref.version}`;
}

export class StrategyGeneratorRegistry {
  private readonly generators = new Map<string, StrategyGenerator>();

  constructor(generators: readonly StrategyGenerator[] = []) {
    for (const generator of generators) {
      this.register(generator);
    }
  }

  register(generator: StrategyGenerator): void {
    const key = keyOf(generator.descriptor);
    if (this.generators.has(key)) {
      throw new Error(`GENERATOR_ALREADY_REGISTERED: ${key}`);
    }
    this.generators.set(key, generator);
  }

  list(): readonly GeneratorDescriptor[] {
    return [...this.generators.values()].map((generator) => generator.descriptor);
  }

  resolve(ref: GeneratorRef): StrategyGenerator {
    const generator = this.generators.get(keyOf(ref));
    if (generator === undefined) {
      throw new Error(`GENERATOR_NOT_FOUND: ${keyOf(ref)}`);
    }
    return generator;
  }
}
