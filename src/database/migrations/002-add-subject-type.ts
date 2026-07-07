import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectType1700000000002 implements MigrationInterface {
  name = 'AddSubjectType1700000000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE triples
        ADD COLUMN subject_type CHAR(1) NOT NULL DEFAULT 'U'
        CHECK (subject_type IN ('U', 'B'))
    `);

    await q.query(`DROP INDEX IF EXISTS idx_triples_unique`);
    await q.query(`
      CREATE UNIQUE INDEX idx_triples_unique ON triples(
        graph_id, subject, subject_type, predicate, object, object_type,
        COALESCE(lang_tag, ''), COALESCE(datatype, '')
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_triples_unique`);
    await q.query(`
      CREATE UNIQUE INDEX idx_triples_unique ON triples(
        graph_id, subject, predicate, object, object_type,
        COALESCE(lang_tag, ''), COALESCE(datatype, '')
      )
    `);
    await q.query(`ALTER TABLE triples DROP COLUMN subject_type`);
  }
}
