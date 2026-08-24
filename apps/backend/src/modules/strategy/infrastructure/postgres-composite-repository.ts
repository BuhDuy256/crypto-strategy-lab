import type { Pool } from "pg";
import type { CompositeStrategyDefinition } from "../domain/composite-strategy.js";

export class PostgresCompositeRepository {
  constructor(private readonly pool: Pool) {}

  async save(definition: CompositeStrategyDefinition): Promise<void> {
    const query = `
      INSERT INTO strategy.composites (id, version, name, description, components, policy, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;
    const values = [
      definition.id,
      definition.version,
      definition.name,
      definition.description,
      JSON.stringify(definition.components),
      JSON.stringify(definition.policy)
    ];
    await this.pool.query(query, values);
  }

  async load(id: string): Promise<CompositeStrategyDefinition | null> {
    const result = await this.pool.query("SELECT * FROM strategy.composites WHERE id = $1", [id]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      version: row.version,
      name: row.name,
      description: row.description,
      components: row.components,
      policy: row.policy
    };
  }

  async list(): Promise<CompositeStrategyDefinition[]> {
    const result = await this.pool.query("SELECT * FROM strategy.composites ORDER BY created_at DESC");
    return result.rows.map(row => ({
      id: row.id,
      version: row.version,
      name: row.name,
      description: row.description,
      components: row.components,
      policy: row.policy
    }));
  }
}
