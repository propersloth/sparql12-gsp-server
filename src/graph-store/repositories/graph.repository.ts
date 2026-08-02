import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DEFAULT_GRAPH_IRI, Graph } from '../../database/entities/graph.entity';

export { DEFAULT_GRAPH_IRI };

@Injectable()
export class GraphRepository {
  constructor(
    @InjectRepository(Graph)
    private readonly repo: Repository<Graph>,
  ) {}

  async findByIri(iri: string): Promise<Graph | null> {
    return this.repo.findOne({ where: { iri } });
  }

  async findByIriOrDefault(iri: string | null): Promise<Graph | null> {
    if (iri === null) {
      return this.findDefault();
    }
    return this.findByIri(iri);
  }

  async findById(id: string): Promise<Graph | null> {
    return this.repo.findOne({ where: { id } });
  }

  // The default graph row is seeded by the migration. Never auto-create here.
  async findDefault(): Promise<Graph> {
    const g = await this.repo.findOne({ where: { isDefault: true } });
    if (!g) throw new Error('Default graph row missing — run migrations (GSP-002)');
    return g;
  }

  async create(iri: string): Promise<Graph> {
    const g = this.repo.create({ iri, isDefault: false });
    return this.repo.save(g);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  async exists(iri: string): Promise<boolean> {
    return (await this.repo.count({ where: { iri } })) > 0;
  }

  // --- Transaction-aware variants (used by GSP-023/024) ---

  async findByIriInTxn(m: EntityManager, iri: string): Promise<Graph | null> {
    return m.findOne(Graph, { where: { iri } });
  }

  async findByIriOrDefaultInTxn(m: EntityManager, iri: string | null): Promise<Graph | null> {
    if (iri === null) {
      const g = await m.findOne(Graph, { where: { isDefault: true } });
      if (!g) throw new Error('Default graph row missing — run migrations (GSP-002)');
      return g;
    }
    return this.findByIriInTxn(m, iri);
  }

  async createInTxn(m: EntityManager, iri: string): Promise<Graph> {
    const g = m.create(Graph, { iri, isDefault: false });
    return m.save(Graph, g);
  }

  async deleteInTxn(m: EntityManager, id: string): Promise<void> {
    const rows: Array<{ is_default: boolean | null; deleted: number }> = await m.query(
      `
        WITH target AS (
          SELECT is_default FROM graphs WHERE id = $1
        ),
        deleted AS (
          DELETE FROM graphs
          WHERE id = $1 AND is_default = false
          RETURNING id
        )
        SELECT
          (SELECT is_default FROM target) AS is_default,
          (SELECT COUNT(*)::int FROM deleted) AS deleted
      `,
      [id],
    );

    if ((rows[0]?.deleted ?? 0) > 0) {
      return;
    }

    if (rows[0]?.is_default === true) {
      throw new Error('Default graph row cannot be deleted');
    }
  }

  async incrementVersionInTxn(m: EntityManager, id: string): Promise<number> {
    const result = await m.query(
      `UPDATE graphs SET version = version + 1, updated_at = now() WHERE id = $1 RETURNING version`,
      [id],
    );
    // TypeORM's postgres driver returns raw UPDATE/INSERT/DELETE ... RETURNING
    // queries as a `[rows, affectedRowCount]` tuple (unlike a plain SELECT,
    // which resolves to the rows array directly) -- confirmed against a real
    // Postgres instance while building the GSP-041 compliance suite, which
    // caught this because it exercises the real driver instead of a mocked
    // EntityManager. Unwrap defensively so both shapes work.
    const rows: Array<{ version: string }> = Array.isArray(result[0]) ? result[0] : result;
    if (rows.length === 0) {
      throw new Error(`Data consistency error: graph ${id} not found during version increment`);
    }
    const version = Number.parseInt(rows[0].version, 10);
    if (Number.isNaN(version) || !Number.isSafeInteger(version)) {
      throw new Error(`Invalid or unsafe graph version value from DB: ${rows[0].version}`);
    }
    return version;
  }
}
