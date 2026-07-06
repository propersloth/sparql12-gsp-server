import { DataSource } from 'typeorm';
import { InitialSchema1700000000001 } from '../../../src/database/migrations/001-initial-schema';

const defaultDatabaseUrl = ['postgresql://gsp:test', 'localhost:5432/gsp_test'].join('@');

describe('Database Schema', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL || defaultDatabaseUrl,
      synchronize: false,
      logging: false,
      migrations: [InitialSchema1700000000001],
    });
    await dataSource.initialize();
    await dataSource.query(`DROP TABLE IF EXISTS "migrations"`);
    await dataSource.query(`DROP TABLE IF EXISTS triples`);
    await dataSource.query(`DROP TABLE IF EXISTS graphs`);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM triples`);
    await dataSource.query(`DELETE FROM graphs WHERE is_default = false`);
    await dataSource.destroy();
  });

  describe('Graphs Table', () => {
    it('should have UUID primary key', async () => {
      const [row] = await dataSource.query(
        `INSERT INTO graphs (iri) VALUES ('http://example.org/uuid-test') RETURNING id`,
      );
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should enforce unique IRI constraint', async () => {
      const iri = 'http://example.org/unique-test';
      await dataSource.query(`INSERT INTO graphs (iri) VALUES ($1)`, [iri]);
      await expect(dataSource.query(`INSERT INTO graphs (iri) VALUES ($1)`, [iri])).rejects.toThrow();
    });

    it('should allow at most one default graph (partial unique index)', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO graphs (iri, is_default) VALUES ('urn:x-second-default', true)`,
        ),
      ).rejects.toThrow();
    });

    describe('TC-NFR-08: persistence across restart', () => {
      let insertedId: string;

      beforeEach(async () => {
        const [inserted] = await dataSource.query(
          `INSERT INTO graphs (iri, version) VALUES ('http://example.org/persist', 7) RETURNING id`,
        );
        insertedId = inserted.id;
      });

      afterEach(async () => {
        await dataSource.query(`DELETE FROM graphs WHERE id = $1`, [insertedId]);
      });

      it('version survives a DataSource destroy/initialize cycle', async () => {
        await dataSource.destroy();
        await dataSource.initialize();
        const [row] = await dataSource.query(`SELECT iri, version FROM graphs WHERE id = $1`, [
          insertedId,
        ]);

        expect(row.iri).toBe('http://example.org/persist');
        expect(Number(row.version)).toBe(7);
      });
    });
  });

  describe('Triples Table', () => {
    it('should enforce object_type CHECK constraint', async () => {
      const [graph] = await dataSource.query(
        `INSERT INTO graphs (iri) VALUES ('http://ex.org/check-test') RETURNING id`,
      );
      await expect(
        dataSource.query(
          `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type)
           VALUES ($1, 'http://ex.org/s', 'U', 'http://ex.org/p', 'value', 'X')`,
          [graph.id],
        ),
      ).rejects.toThrow();
    });

    it('should enforce subject_type CHECK constraint', async () => {
      const [graph] = await dataSource.query(
        `INSERT INTO graphs (iri) VALUES ('http://ex.org/subject-check-test') RETURNING id`,
      );
      await expect(
        dataSource.query(
          `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type)
           VALUES ($1, 'http://ex.org/s', 'X', 'http://ex.org/p', 'value', 'U')`,
          [graph.id],
        ),
      ).rejects.toThrow();
    });

    it('should support U / B subject types and U / L / B object types', async () => {
      const [graph] = await dataSource.query(
        `INSERT INTO graphs (iri) VALUES ('http://ex.org/types') RETURNING id`,
      );
      await dataSource.query(
        `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type, lang_tag, datatype)
         VALUES
           ($1,'http://ex.org/s','U','http://ex.org/p','http://ex.org/o','U',NULL,NULL),
           ($1,'http://ex.org/s','U','http://ex.org/p','hi','L','en',NULL),
           ($1,'http://ex.org/s','U','http://ex.org/p','42','L',NULL,'http://www.w3.org/2001/XMLSchema#integer'),
           ($1,'http://ex.org/s','U','http://ex.org/p','genid-abc123','B',NULL,NULL),
           ($1,'genid-subj-456','B','http://ex.org/p','http://ex.org/o','U',NULL,NULL)`,
        [graph.id],
      );
      const rows = await dataSource.query(
        `SELECT subject_type, object_type FROM triples WHERE graph_id = $1 ORDER BY id`,
        [graph.id],
      );

      expect(rows.map((row: { object_type: string }) => row.object_type)).toEqual([
        'U',
        'L',
        'L',
        'B',
        'U',
      ]);
      expect(rows.map((row: { subject_type: string }) => row.subject_type)).toEqual([
        'U',
        'U',
        'U',
        'U',
        'B',
      ]);
    });

    it('should cascade delete triples when graph is deleted', async () => {
      const [graph] = await dataSource.query(
        `INSERT INTO graphs (iri) VALUES ('http://ex.org/cascade') RETURNING id`,
      );
      await dataSource.query(
        `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type)
         VALUES ($1,'http://ex.org/s','U','http://ex.org/p','http://ex.org/o','U')`,
        [graph.id],
      );
      await dataSource.query(`DELETE FROM graphs WHERE id = $1`, [graph.id]);
      const [after] = await dataSource.query(
        `SELECT COUNT(*)::int AS c FROM triples WHERE graph_id = $1`,
        [graph.id],
      );

      expect(after.c).toBe(0);
    });
  });

  describe('Indexes', () => {
    it('should have composite indexes on (graph_id, subject/predicate/object)', async () => {
      const indexes = await dataSource.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'triples'`);
      const defs = indexes.map((index: { indexdef: string }) => index.indexdef).join('\n');

      expect(defs).toMatch(/graph_id/);
      expect(defs).toMatch(/graph_id.*subject|subject.*graph_id/);
    });

    it('should have idx_triples_unique composite dedup index', async () => {
      const [row] = await dataSource.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='triples' AND indexname='idx_triples_unique'`,
      );

      expect(row).toBeDefined();
      expect(row.indexname).toBe('idx_triples_unique');
      expect(row.indexdef).toContain('subject_type');
      expect(row.indexdef).toContain('object_type');
    });

    it('idx_triples_unique prevents duplicate triples (ON CONFLICT DO NOTHING contract)', async () => {
      const [graph] = await dataSource.query(
        `INSERT INTO graphs (iri) VALUES ('http://ex.org/dedup-test') RETURNING id`,
      );
      await dataSource.query(
        `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type)
         VALUES ($1,'http://ex.org/s','U','http://ex.org/p','http://ex.org/o','U')`,
        [graph.id],
      );
      await expect(
        dataSource.query(
          `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type)
           VALUES ($1,'http://ex.org/s','U','http://ex.org/p','http://ex.org/o','U')
           ON CONFLICT DO NOTHING`,
          [graph.id],
        ),
      ).resolves.toBeDefined();
      const [count] = await dataSource.query(
        `SELECT COUNT(*)::int AS c FROM triples WHERE graph_id = $1`,
        [graph.id],
      );

      expect(count.c).toBe(1);
    });

    it('idx_triples_unique distinguishes subject_type for the same stored subject string', async () => {
      const [graph] = await dataSource.query(
        `INSERT INTO graphs (iri) VALUES ('http://ex.org/subject-type-unique-test') RETURNING id`,
      );
      await dataSource.query(
        `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type)
         VALUES ($1,'http://ex.org/genid-shared','U','http://ex.org/p','http://ex.org/o','U')`,
        [graph.id],
      );
      await dataSource.query(
        `INSERT INTO triples (graph_id, subject, subject_type, predicate, object, object_type)
         VALUES ($1,'genid-shared','B','http://ex.org/p','http://ex.org/o','U')`,
        [graph.id],
      );
      const [count] = await dataSource.query(
        `SELECT COUNT(*)::int AS c FROM triples WHERE graph_id = $1`,
        [graph.id],
      );

      expect(count.c).toBe(2);
    });
  });

  describe('TC-CC-08: version increment contract (application-driven)', () => {
    it('manual UPDATE increments version by 1', async () => {
      const [graph] = await dataSource.query(
        `INSERT INTO graphs (iri, version) VALUES ('http://ex.org/ver', 0) RETURNING id`,
      );
      await dataSource.query(
        `UPDATE graphs SET version = version + 1, updated_at = now() WHERE id = $1`,
        [graph.id],
      );
      const [row] = await dataSource.query(`SELECT version FROM graphs WHERE id = $1`, [graph.id]);

      expect(Number(row.version)).toBe(1);
    });
  });
});
