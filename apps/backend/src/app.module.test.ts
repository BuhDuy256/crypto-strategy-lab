import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { ApiModule } from "./modules/api/index.js";
import { MarketModule } from "./modules/market/index.js";
import { StrategyModule } from "./modules/strategy/index.js";
import { ExperimentModule } from "./modules/experiment/index.js";
import { NewsModule } from "./modules/news/index.js";

describe("AppModule", () => {
  it("contains all five frozen logical modules in its application graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    // moduleRef.select() throws if the given module is not part of the
    // compiled application graph, so a non-throwing select is the graph
    // membership check.
    expect(() => moduleRef.select(ApiModule)).not.toThrow();
    expect(() => moduleRef.select(MarketModule)).not.toThrow();
    expect(() => moduleRef.select(StrategyModule)).not.toThrow();
    expect(() => moduleRef.select(ExperimentModule)).not.toThrow();
    expect(() => moduleRef.select(NewsModule)).not.toThrow();

    await moduleRef.close();
  });
});
