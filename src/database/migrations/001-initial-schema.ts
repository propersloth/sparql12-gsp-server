import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000001 implements MigrationInterface {
  name = 'InitialSchema1700000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await q.query(`CREATE TABLE graphs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      iri TEXT NOT NULL UNIQUE,
      version BIGINT NOT NULL DEFAULT 0,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE UNIQUE INDEX uq_graphs_single_default ON graphs (is_default) WHERE is_default`,
    );
    await q.query(
      `INSERT INTO graphs (iri, is_default, version) VALUES ('urn:x-arq:DefaultGraph', true, 0)`,
    );
    await q.query(`CREATE TABLE triples (
      id BIGSERIAL PRIMARY KEY,
      graph_id UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      object_type CHAR(1) NOT NULL CHECK (object_type IN ('U','L','B')),
      lang_tag TEXT,
      datatype TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_triples_graph_id        ON triples(graph_id)`);
    await q.query(`CREATE INDEX idx_triples_subject         ON triples(subject)`);
    await q.query(`CREATE INDEX idx_triples_predicate       ON triples(predicate)`);
    await q.query(`CREATE INDEX idx_triples_object          ON triples(object)`);
    await q.query(`CREATE INDEX idx_triples_graph_subject   ON triples(graph_id, subject)`);
    await q.query(`CREATE INDEX idx_triples_graph_predicate ON triples(graph_id, predicate)`);
    await q.query(`CREATE INDEX idx_triples_graph_object    ON triples(graph_id, object)`);
    await q.query(`CREATE UNIQUE INDEX idx_triples_unique ON triples(
      graph_id, subject, predicate, object, object_type,
      COALESCE(lang_tag,''), COALESCE(datatype,'')
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS triples`);
    await q.query(`DROP TABLE IF EXISTS graphs`);
  }
}
