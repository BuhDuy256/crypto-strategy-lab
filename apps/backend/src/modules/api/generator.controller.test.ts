import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { GeneratorController } from "./generator.controller.js";
import { StrategyGeneratorRegistry } from "../strategy/index.js";
import type { CandidateStrategy } from "../strategy/index.js";
import type { GenerateRequest, StrategyGenerator } from "../strategy/index.js";

// A throwaway generator registered purely through the port: it must appear in
// the catalog with no change to the controller (rehearsal for PROOF-REPLACE-001).
class FakeGenerator implements StrategyGenerator {
  descriptor = {
    id: "fake-generator",
    version: "1.0.0",
    name: "Fake Generator",
    description: "A throwaway generator for testing catalog output",
    configurationSchema: { properties: {}, required: [] }
  };

  *generate(_request: GenerateRequest): Generator<CandidateStrategy> {
    // No candidates needed for a catalog test.
  }
}

describe("GeneratorController", () => {
  it("returns registered generators in the catalog without controller changes", async () => {
    const registry = new StrategyGeneratorRegistry([new FakeGenerator()]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeneratorController],
      providers: [{ provide: StrategyGeneratorRegistry, useValue: registry }]
    }).compile();

    const controller = module.get<GeneratorController>(GeneratorController);
    const response = controller.getGenerators();

    expect(response.generators).toHaveLength(1);
    expect(response.generators[0]!.id).toBe("fake-generator");
    expect(response.generators[0]!.name).toBe("Fake Generator");
    expect(response.generators[0]!.configurationSchema).toEqual({ properties: {}, required: [] });
  });
});
