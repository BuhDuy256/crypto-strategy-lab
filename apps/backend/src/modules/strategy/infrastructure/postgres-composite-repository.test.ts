import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Pool } from "pg";
import { PostgresCompositeRepository } from "./postgres-composite-repository.js";
import { resetTestDatabase } from "../../../platform/test-database.js";

describe("PostgresCompositeRepository", () => {
  let pool: Pool;
  let repo: PostgresCompositeRepository;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    repo = new PostgresCompositeRepository(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("saves and loads a composite definition", async () => {
    const def = {
      id: "comp-1",
      version: "1.0.0",
      name: "Test Comp",
      description: "Test Desc",
      components: [
        { id: "ma", version: "1.0.0", parameters: { period: 10 } }
      ],
      policy: {
        id: "majority-vote",
        version: "1.0.0",
        configuration: {}
      }
    };
    
    await repo.save(def);
    const loaded = await repo.load("comp-1");
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe("Test Comp");
    expect(loaded?.components).toEqual(def.components);
    expect(loaded?.policy).toEqual(def.policy);
  });
});
