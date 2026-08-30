// PostgreSQL adapter for the Experiment-owned specification lifecycle envelope.

import type { Pool } from "pg";
import type { ExperimentSpecificationStore } from "../application/experiment-specification-service.js";
import type {
  DraftExperimentSpecification,
  ExperimentDraftContent,
  ExperimentSpecification,
  FrozenExperimentContent,
  FrozenExperimentSpecification
} from "../domain/experiment-specification.js";

interface SpecificationRow {
  readonly spec_id: string;
  readonly status: "draft" | "frozen";
  readonly content: ExperimentDraftContent | FrozenExperimentContent;
  readonly content_hash: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly frozen_at: Date | null;
}

function fromRow(row: SpecificationRow): ExperimentSpecification {
  const base = {
    specId: row.spec_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
  if (row.status === "draft") {
    return { ...base, status: "draft", content: row.content as ExperimentDraftContent };
  }
  if (row.content_hash === null || row.frozen_at === null) {
    throw new Error(`EXPERIMENT_STORAGE: frozen specification ${row.spec_id} is incomplete`);
  }
  return {
    ...base,
    status: "frozen",
    content: row.content as FrozenExperimentContent,
    contentHash: row.content_hash,
    frozenAt: row.frozen_at.toISOString()
  };
}

const RETURNING = `
  RETURNING spec_id, status, content, content_hash, created_at, updated_at, frozen_at
`;

export class PostgresExperimentSpecificationStore implements ExperimentSpecificationStore {
  constructor(private readonly pool: Pool) {}

  async create(
    specId: string,
    content: ExperimentDraftContent
  ): Promise<DraftExperimentSpecification> {
    const result = await this.pool.query<SpecificationRow>(
      `INSERT INTO experiment.specifications (spec_id, status, content)
       VALUES ($1, 'draft', $2::jsonb) ${RETURNING}`,
      [specId, JSON.stringify(content)]
    );
    return fromRow(this.requireRow(result.rows[0], specId)) as DraftExperimentSpecification;
  }

  async updateDraft(
    specId: string,
    content: ExperimentDraftContent
  ): Promise<DraftExperimentSpecification> {
    const result = await this.pool.query<SpecificationRow>(
      `UPDATE experiment.specifications
       SET content = $2::jsonb, updated_at = now()
       WHERE spec_id = $1 AND status = 'draft' ${RETURNING}`,
      [specId, JSON.stringify(content)]
    );
    if (result.rows[0] === undefined) {
      await this.assertMutable(specId);
    }
    return fromRow(this.requireRow(result.rows[0], specId)) as DraftExperimentSpecification;
  }

  async freeze(
    specId: string,
    content: FrozenExperimentContent,
    contentHash: string
  ): Promise<FrozenExperimentSpecification> {
    const result = await this.pool.query<SpecificationRow>(
      `UPDATE experiment.specifications
       SET status = 'frozen', content = $2::jsonb, content_hash = $3,
           frozen_at = now(), updated_at = now()
       WHERE spec_id = $1 AND status = 'draft' ${RETURNING}`,
      [specId, JSON.stringify(content), contentHash]
    );
    if (result.rows[0] === undefined) {
      await this.assertMutable(specId);
    }
    return fromRow(this.requireRow(result.rows[0], specId)) as FrozenExperimentSpecification;
  }

  async find(specId: string): Promise<ExperimentSpecification | undefined> {
    const result = await this.pool.query<SpecificationRow>(
      `SELECT spec_id, status, content, content_hash, created_at, updated_at, frozen_at
       FROM experiment.specifications WHERE spec_id = $1`,
      [specId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : fromRow(row);
  }

  private requireRow(row: SpecificationRow | undefined, specId: string): SpecificationRow {
    if (row === undefined) {
      throw new Error(`EXPERIMENT_NOT_FOUND: ${specId}`);
    }
    return row;
  }

  private async assertMutable(specId: string): Promise<void> {
    const existing = await this.find(specId);
    if (existing?.status === "frozen") {
      throw new Error(`EXPERIMENT_FROZEN: specification ${specId} is frozen`);
    }
    throw new Error(`EXPERIMENT_NOT_FOUND: ${specId}`);
  }
}
