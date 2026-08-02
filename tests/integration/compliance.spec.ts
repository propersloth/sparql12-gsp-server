/**
 * tests/integration/compliance.spec.ts
 *
 * GSP-041: full end-to-end compliance suite against a LIVE Postgres
 * instance, verifying all nine URD exit gates (G1-G9) plus the v2/v3
 * patch additions (TC-COMP-05b, TC-COMP-06b, TC-COMP-10).
 *
 * Unlike every other integration spec in this repo, this suite does NOT
 * run with GSP_DISABLE_DB=true. tests/setup.ts forces that flag on for
 * every spec file so the rest of the suite can run without a database,
 * but G8 (PATCH atomicity) and G9 (concurrency control) depend on real
 * transaction isolation and advisory locks that an in-memory mock cannot
 * exercise -- see the ticket's acceptance criteria. Because src/app.module.ts
 * reads process.env.GSP_DISABLE_DB at import time to decide which
 * providers/controllers to wire up, this file unsets the flag and
 * `require()`s AppModule fresh inside beforeAll, after tests/setup.ts has
 * already run. Jest gives each spec file its own module registry, so this
 * does not leak into any other test file.
 *
 * Excluded from the default `npm test` run (see package.json) for the same
 * reason tests/unit/database/schema.spec.ts is: it needs a live database,
 * not a mock, so it has its own `npm run test:compliance` script and CI
 * job with a real Postgres service (see .github/workflows/ci.yml).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { RdfService } from '../../src/rdf/rdf.service';
import { RdfServiceImpl } from '../../src/rdf/rdf.service';
import { InitialSchema1700000000001 } from '../../src/database/migrations/001-initial-schema';
import { AddSubjectType1700000000002 } from '../../src/database/migrations/002-add-subject-type';
import { createTestApp } from '../setup';
import {
  deleteGraph,
  getGraph,
  patchGraph,
  postGraph,
  putGraph,
} from '../helpers/request.helper';
import { canonize } from 'rdf-canonize';
import { assertIsomorphic, countDistinctBlankNodes } from '../helpers/rdf.helper';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || ['postgresql://gsp:test', 'localhost:5432/gsp_test'].join('@');

/**
 * Like assertIsomorphic, but compares triples only, ignoring each quad's
 * graph term. Needed specifically for the JSON-LD round-trip case: JSON-LD
 * is one of GraphStoreService's QUAD_FORMATS (alongside TriG/N-Quads), so a
 * GET response in that format legitimately embeds the resource's own graph
 * IRI as the JSON-LD dataset name -- while the PUT payload, a plain
 * single-graph JSON-LD document with no dataset wrapper, parses into the
 * DefaultGraph. That's correct server behavior (see
 * tests/unit/rdf/serialize.spec.ts's TC-FMT tests for the same pattern with
 * TriG/N-Quads), not a round-trip defect, so comparing at the quad level
 * would fail on the graph term alone even though the triples -- what G4
 * actually requires ("same triples, same blank-node structure") -- match.
 */
async function assertIsomorphicAsTriples(
  svc: RdfService,
  a: string,
  b: string,
  ctA: string,
  ctB = ctA,
): Promise<void> {
  const stripGraph = (q: { subject: unknown; predicate: unknown; object: unknown }) => ({
    subject: q.subject,
    predicate: q.predicate,
    object: q.object,
    graph: { termType: 'DefaultGraph' as const, value: '' },
  });
  const da = [...(await svc.parse(Buffer.from(a), ctA))].map(stripGraph);
  const db = [...(await svc.parse(Buffer.from(b), ctB))].map(stripGraph);
  const ca = await canonize(da, { algorithm: 'RDFC-1.0' });
  const cb = await canonize(db, { algorithm: 'RDFC-1.0' });
  expect(ca).toEqual(cb);
}

describe('GSP Compliance', () => {
  let app: INestApplication;
  let rdfService: RdfService;

  beforeAll(async () => {
    // Ensure the schema exists (idempotent -- TypeORM records applied
    // migrations, so re-running against an already-migrated DB is a no-op)
    // and start from a clean slate for non-default graphs so repeated local
    // runs against a persistent Postgres don't see stale fixtures from a
    // previous run.
    const migrationDataSource = new DataSource({
      type: 'postgres',
      url: testDatabaseUrl,
      synchronize: false,
      logging: false,
      migrations: [InitialSchema1700000000001, AddSubjectType1700000000002],
    });
    await migrationDataSource.initialize();
    await migrationDataSource.runMigrations();
    await migrationDataSource.query(`DELETE FROM triples`);
    await migrationDataSource.query(`DELETE FROM graphs WHERE is_default = false`);
    await migrationDataSource.query(`UPDATE graphs SET version = 0 WHERE is_default = true`);
    await migrationDataSource.destroy();

    delete process.env.GSP_DISABLE_DB;
    process.env.GSP_DATABASE_URL = testDatabaseUrl;
    // This suite predates issue #46 (auth guards wired to every mutation
    // route via AppModule -> AuthModule -> the real ConfigService, which
    // reads real env vars, unlike the bare-controller integration suites
    // that override ConfigService via DI -- see tests/helpers/
    // auth-test.helper.ts). None of this suite's requests carry auth
    // credentials, so disable enforcement the same way #46 did for every
    // other pre-existing integration suite: GSP_AUTH_ENABLED=false. This
    // suite isn't testing auth, tests/integration/auth-enforcement.spec.ts
    // (from #46) already covers that.
    process.env.GSP_AUTH_ENABLED = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('../../src/app.module');
    app = await createTestApp(AppModule);

    // Resolved from the DI container, not instantiated separately -- this
    // repo registers the concrete RdfServiceImpl class as its own DI token
    // (RdfService is a TS interface, not a runtime value/token), so
    // app.get(RdfServiceImpl) is this codebase's equivalent of the
    // app.get(RdfService) pattern from the ticket. RdfServiceImpl
    // structurally satisfies the RdfService interface used by the
    // assertIsomorphic/countDistinctBlankNodes helpers below.
    rdfService = app.get(RdfServiceImpl);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TC-COMP-01: G1 MUST Requirements', () => {
    /**
     * G1: All MUST requirements have passing tests
     */

    it('GET returns 200 for existing graph with RDF', async () => {
      await putGraph(app, 'http://ex.org/must-get', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const response = await getGraph(app, 'http://ex.org/must-get');
      expect(response.status).toBe(200);
      expect(response.text).toContain('http://ex.org/s');
    });

    it('GET returns 404 for absent graph', async () => {
      const response = await getGraph(app, 'http://ex.org/nonexistent');
      expect(response.status).toBe(404);
    });

    it('PUT creates new graph with 201', async () => {
      const response = await putGraph(app, 'http://ex.org/new-graph', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      expect([200, 201, 204]).toContain(response.status);
    });

    it('PUT replaces existing graph', async () => {
      await putGraph(app, 'http://ex.org/replace-test', `@prefix ex: <http://ex.org/> . ex:s1 ex:p ex:o1 .`);
      await putGraph(app, 'http://ex.org/replace-test', `@prefix ex: <http://ex.org/> . ex:s2 ex:p ex:o2 .`);

      const response = await getGraph(app, 'http://ex.org/replace-test');
      expect(response.text).toContain('http://ex.org/s2');
      expect(response.text).not.toContain('http://ex.org/s1');
    });

    it('POST merges with existing graph', async () => {
      await putGraph(app, 'http://ex.org/merge', `@prefix ex: <http://ex.org/> . ex:s1 ex:p ex:o1 .`);

      await postGraph(app, `@prefix ex: <http://ex.org/> . ex:s2 ex:p ex:o2 .`, {
        targetIri: 'http://ex.org/merge',
      });

      const response = await getGraph(app, 'http://ex.org/merge');
      expect(response.text).toContain('http://ex.org/s1');
      expect(response.text).toContain('http://ex.org/s2');
    });

    it('POST to /graph-store mints new graph', async () => {
      const response = await request(app.getHttpServer())
        .post('/graph-store')
        .set('Content-Type', 'text/turtle')
        .send(`@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`)
        .expect(201);

      expect(response.headers.location).toBeDefined();
    });

    it('DELETE removes existing graph', async () => {
      await putGraph(app, 'http://ex.org/to-delete', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);

      await deleteGraph(app, 'http://ex.org/to-delete');

      const getResponse = await getGraph(app, 'http://ex.org/to-delete');
      expect(getResponse.status).toBe(404);
    });

    it('PATCH updates graph atomically', async () => {
      await putGraph(app, 'http://ex.org/patch-atomic', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const etag = (await getGraph(app, 'http://ex.org/patch-atomic')).headers.etag;

      await patchGraph(
        app,
        'http://ex.org/patch-atomic',
        `INSERT { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new> } WHERE {}`,
        etag,
      );

      const response = await getGraph(app, 'http://ex.org/patch-atomic');
      expect(response.text).toContain('new');
    });
  });

  describe('TC-COMP-02: G4 Round-Trip Isomorphism', () => {
    /**
     * G4: PUT -> GET yields an isomorphic RDF graph (same triples, same blank-node
     * structure), regardless of serialization format. Verified via RDFC-1.0
     * canonical form comparison -- not substring matching, so a server that drops
     * a triple, mangles a literal, or returns a different graph fails this test.
     *
     * NOTE (GSP-004): the RDF/XML fixture below is deliberately expressible in
     * RDF/XML (no unsplittable predicates, no XML-illegal characters) -- this
     * suite verifies round-trip FIDELITY, not the format's error path. The
     * error path (RdfXmlSerializationException -> 500) is covered end-to-end
     * in GSP-022's TC-GET-08, on both named and default graphs, against the
     * adversarial fixtures from GSP-001.
     */

    it('Turtle: PUT -> GET is isomorphic', async () => {
      const content = `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o . ex:s ex:q "literal" .`;
      await putGraph(app, 'http://ex.org/rt-turtle', content, { contentType: 'text/turtle' });
      const body = (await getGraph(app, 'http://ex.org/rt-turtle', { accept: 'text/turtle' })).text;

      // assertIsomorphic parses both as the named-graph content, canonicalizes
      // with RDFC-1.0, and compares the resulting sorted N-Quads strings.
      await assertIsomorphic(rdfService, content, body, 'text/turtle');
    });

    it('RDF/XML: PUT -> GET is isomorphic', async () => {
      const content = `<?xml version="1.0"?>
        <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
                 xmlns:ex="http://ex.org/">
          <rdf:Description rdf:about="http://ex.org/s">
            <ex:p rdf:resource="http://ex.org/o"/>
          </rdf:Description>
        </rdf:RDF>`;
      await putGraph(app, 'http://ex.org/rt-rdfxml', content, { contentType: 'application/rdf+xml' });
      const body = (await getGraph(app, 'http://ex.org/rt-rdfxml', { accept: 'application/rdf+xml' })).text;
      await assertIsomorphic(rdfService, content, body, 'application/rdf+xml');
    });

    it('JSON-LD: PUT -> GET is isomorphic', async () => {
      const content = JSON.stringify({
        '@context': { ex: 'http://ex.org/' },
        '@id': 'ex:s',
        'ex:p': { '@id': 'ex:o' },
        'ex:q': 'literal',
      });
      await putGraph(app, 'http://ex.org/rt-jsonld', content, { contentType: 'application/ld+json' });
      const body = (await getGraph(app, 'http://ex.org/rt-jsonld', { accept: 'application/ld+json' })).text;
      // assertIsomorphicAsTriples, not assertIsomorphic: JSON-LD is a
      // QUAD_FORMAT for this server (see the helper's doc comment above),
      // so the GET response legitimately carries the graph's own IRI as
      // its JSON-LD dataset name even though the PUT payload didn't.
      await assertIsomorphicAsTriples(rdfService, content, body, 'application/ld+json');
    });

    it('Cross-format: PUT as Turtle, GET as N-Triples is isomorphic', async () => {
      const content = `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`;
      await putGraph(app, 'http://ex.org/rt-cross', content, { contentType: 'text/turtle' });
      const ntBody = (await getGraph(app, 'http://ex.org/rt-cross', { accept: 'application/n-triples' })).text;
      // assertIsomorphic handles different input formats via the optional ctB parameter:
      await assertIsomorphic(rdfService, content, ntBody, 'text/turtle', 'application/n-triples');
    });

    it('Blank nodes: PUT -> GET preserves bnode structure (isomorphic, not identical labels)', async () => {
      const content = `@prefix ex: <http://ex.org/> .
        ex:s ex:p _:b1 .
        _:b1 ex:q "value" .`;
      await putGraph(app, 'http://ex.org/rt-bnodes', content, { contentType: 'text/turtle' });
      const body = (await getGraph(app, 'http://ex.org/rt-bnodes', { accept: 'text/turtle' })).text;
      // Blank-node labels need not be preserved -- isomorphism allows relabelling.
      await assertIsomorphic(rdfService, content, body, 'text/turtle');
    });
  });

  describe('TC-COMP-05: G5 Blank Node Merge', () => {
    /**
     * G5: POST merges without blank-node ID collision.
     * RDF merge must standardize blank nodes apart -- a reused label "_:b1" in
     * the incoming payload must become a DISTINCT blank node in the stored graph,
     * not be identified with the existing "_:b1". Verified via exact distinct-count
     * comparison, not a regex over the serialized body.
     */

    it('reused bnode label in POST payload does NOT collapse with existing bnode', async () => {
      // Existing graph: one bnode _:b1 tied to ex:s
      await putGraph(app, 'http://ex.org/bnode-merge', `@prefix ex: <http://ex.org/> . ex:s ex:p _:b1 .`, {
        contentType: 'text/turtle',
      });

      // Incoming: REUSES the label _:b1 but is a logically different blank node
      await postGraph(app, `@prefix ex: <http://ex.org/> . ex:s2 ex:p _:b1 .`, {
        targetIri: 'http://ex.org/bnode-merge',
      });

      const body = (await getGraph(app, 'http://ex.org/bnode-merge', { accept: 'application/n-triples' })).text;
      const dataset = await rdfService.parse(Buffer.from(body), 'application/n-triples');

      // Standardized apart: 2 distinct blank nodes (one per source graph), not 1.
      expect(countDistinctBlankNodes(dataset)).toBe(2);
      // Triple count: 1 existing + 1 incoming = 2 (no collapse).
      expect(dataset.size).toBe(2);
    });

    it('blank nodes from two POST batches remain distinct after multiple merges', async () => {
      await putGraph(
        app,
        'http://ex.org/bnode-multi',
        `@prefix ex: <http://ex.org/> . ex:a ex:p _:b1 . ex:b ex:p _:b1 .`,
        { contentType: 'text/turtle' },
      );

      // Two separate POSTs each contributing a blank node with the same label
      await postGraph(app, `@prefix ex: <http://ex.org/> . ex:c ex:p _:b1 .`, {
        targetIri: 'http://ex.org/bnode-multi',
      });
      await postGraph(app, `@prefix ex: <http://ex.org/> . ex:d ex:p _:b1 .`, {
        targetIri: 'http://ex.org/bnode-multi',
      });

      const body = (await getGraph(app, 'http://ex.org/bnode-multi', { accept: 'application/n-triples' })).text;
      const dataset = await rdfService.parse(Buffer.from(body), 'application/n-triples');

      // 4 triples total (2 original + 1 + 1). The original blank node is shared by
      // two triples in the seed payload; each POST adds one new distinct bnode.
      // Total distinct bnodes = 1 (original) + 1 (post1) + 1 (post2) = 3.
      expect(dataset.size).toBe(4);
      expect(countDistinctBlankNodes(dataset)).toBe(3);
    });
  });

  describe('TC-COMP-05b: G5 extended — blank node shared across subject AND object position (v2)', () => {
    /**
     * This is the specific shape that shattered under the withdrawn skolemization
     * strategy (GSP-010 v2): a single logical blank node appears as the OBJECT of
     * one triple and the SUBJECT of another within the same document. If subject-
     * and object-position blank nodes are skolemized independently (or per-quad,
     * rather than once per logical node per parse), this collapses into two or
     * three unrelated terms and the graph's structure is silently corrupted.
     * Fixed in GSP-010 v3 via a single Map<originalLabel, freshLabel> per parse call.
     */

    it('PUT then GET preserves a bnode used as both object and subject', async () => {
      const content = `@prefix ex: <http://ex.org/> .
        ex:s ex:p _:b1 .
        _:b1 ex:q "value" .`;
      await putGraph(app, 'http://ex.org/shared-bnode-pos', content, { contentType: 'text/turtle' });
      const body = (await getGraph(app, 'http://ex.org/shared-bnode-pos', { accept: 'text/turtle' })).text;

      // Isomorphism alone would pass even if the link were severed but both
      // fragments happened to still be present as isolated triples, so this
      // also asserts structure explicitly via distinct-count on the retrieved dataset.
      await assertIsomorphic(rdfService, content, body, 'text/turtle');
      const ds = await rdfService.parse(Buffer.from(body), 'text/turtle');
      expect(countDistinctBlankNodes(ds)).toBe(1); // one logical bnode, not two
    });
  });

  describe('TC-COMP-06: G6 Direct/Indirect Equivalence', () => {
    /**
     * G6: /graph/{iri} ≡ /graph-store?graph={iri}
     */

    it('GET /graph/{iri} ≡ GET /graph-store?graph={iri}', async () => {
      const content = `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`;
      await putGraph(app, 'http://ex.org/equiv-test', content);

      const directResponse = await getGraph(app, 'http://ex.org/equiv-test');
      const indirectResponse = await request(app.getHttpServer())
        .get('/graph-store')
        .query({ graph: 'http://ex.org/equiv-test' })
        .expect(200);

      expect(directResponse.text.trim()).toBe(indirectResponse.text.trim());
    });

    it('PUT /graph/{iri} ≡ PUT /graph-store?graph={iri}', async () => {
      const content = `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`;

      await request(app.getHttpServer())
        .put('/graph-store')
        .query({ graph: 'http://ex.org/equiv-put' })
        .set('Content-Type', 'text/turtle')
        .send(content)
        .expect(201);

      const response = await getGraph(app, 'http://ex.org/equiv-put');
      expect(response.text).toContain('http://ex.org/s');
    });

    it('DELETE equivalence', async () => {
      await putGraph(app, 'http://ex.org/equiv-delete', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);

      // GraphStoreService.deleteGraph consistently returns 204 (No Content),
      // not 200 -- asserted directly here so a future regression to a
      // different status on either route is still caught, not just a
      // mismatch between them.
      const response = await request(app.getHttpServer())
        .delete('/graph-store')
        .query({ graph: 'http://ex.org/equiv-delete' })
        .expect(204);

      expect(response.status).toBe(204);

      const getResponse = await getGraph(app, 'http://ex.org/equiv-delete');
      expect(getResponse.status).toBe(404);
    });
  });

  describe('TC-COMP-06b: G6 extended — indirect PATCH/POST equivalence (v2, D-2)', () => {
    /**
     * PATCH and POST were not supported at all on /graph-store before GSP-030 v2.
     * G6 requires direct and indirect identification to produce identical effects
     * on the same graph -- this closes that gap for the two methods that were
     * previously broken on the indirect path.
     */

    it('PATCH via ?graph= has the same effect as PATCH via /graph/:iri', async () => {
      const iri = 'http://ex.org/g6-patch';
      await putGraph(app, iri, `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const etag = (await getGraph(app, iri)).headers.etag;
      const r = await request(app.getHttpServer())
        .patch(`/graph-store?graph=${encodeURIComponent(iri)}`)
        .set('Content-Type', 'application/sparql-update')
        .set('If-Match', etag)
        .send(`INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new> }`);
      expect(r.status).toBe(200);
      const direct = await getGraph(app, iri);
      expect(direct.text).toContain('http://ex.org/new');
    });

    it('POST via ?graph= merges identically to POST via /graph/:iri', async () => {
      const iriA = 'http://ex.org/g6-post-direct';
      const iriB = 'http://ex.org/g6-post-indirect';
      await putGraph(app, iriA, `@prefix ex: <http://ex.org/> . ex:s1 ex:p ex:o1 .`);
      await putGraph(app, iriB, `@prefix ex: <http://ex.org/> . ex:s1 ex:p ex:o1 .`);
      await postGraph(app, `@prefix ex: <http://ex.org/> . ex:s2 ex:p ex:o2 .`, { targetIri: iriA });
      await request(app.getHttpServer())
        .post(`/graph-store?graph=${encodeURIComponent(iriB)}`)
        .set('Content-Type', 'text/turtle')
        .send(`@prefix ex: <http://ex.org/> . ex:s2 ex:p ex:o2 .`);
      const a = await getGraph(app, iriA);
      const b = await getGraph(app, iriB);
      await assertIsomorphic(rdfService, a.text, b.text, 'text/turtle');
    });
  });

  describe('TC-COMP-07: G7 Dataset Reconciliation', () => {
    /**
     * G7: TriG/N-Quads/JSON-LD payload naming a graph other than the target -> 400
     */

    it('TriG with multiple graphs -> 400', async () => {
      const content = `
        @prefix ex: <http://ex.org/> .
        GRAPH ex:g1 { ex:s1 ex:p ex:o1 . }
        GRAPH ex:g2 { ex:s2 ex:p ex:o2 . }
      `;

      const response = await request(app.getHttpServer())
        .put(`/graph/${encodeURIComponent('http://ex.org/trig-test')}`)
        .set('Content-Type', 'application/trig')
        .send(content)
        .expect(400);

      expect(response.status).toBe(400);
    });

    it('N-Quads with multiple graphs -> 400', async () => {
      const content = `
        <http://ex.org/s1> <http://ex.org/p> <http://ex.org/o1> <http://ex.org/g1> .
        <http://ex.org/s2> <http://ex.org/p> <http://ex.org/o2> <http://ex.org/g2> .
      `;

      const response = await request(app.getHttpServer())
        .put(`/graph/${encodeURIComponent('http://ex.org/nquads-test')}`)
        .set('Content-Type', 'application/n-quads')
        .send(content)
        .expect(400);

      expect(response.status).toBe(400);
    });

    it('JSON-LD naming a graph other than the target via @graph/@id -> 400', async () => {
      // A bare top-level JSON array (or an object with no dataset wrapper)
      // is just multiple nodes in the DEFAULT graph per the JSON-LD spec --
      // it does NOT declare a separate RDF graph, so PUTting it is legal
      // single-graph content, not a G7 violation. To actually name a graph
      // other than the target, JSON-LD needs an explicit graph object: a
      // top-level "@graph" array paired with an "@id" naming that graph.
      const content = JSON.stringify({
        '@id': 'http://ex.org/some-other-graph',
        '@graph': [
          { '@id': 'http://ex.org/s1', 'http://ex.org/p': { '@id': 'http://ex.org/o1' } },
          { '@id': 'http://ex.org/s2', 'http://ex.org/p': { '@id': 'http://ex.org/o2' } },
        ],
      });

      const response = await request(app.getHttpServer())
        .put(`/graph/${encodeURIComponent('http://ex.org/jsonld-test')}`)
        .set('Content-Type', 'application/ld+json')
        .send(content)
        .expect(400);

      expect(response.status).toBe(400);
    });
  });

  describe('TC-COMP-08: G8 PATCH Atomicity', () => {
    /**
     * G8: PATCH success -> consistent state; PATCH failure -> no partial state
     */

    it('PATCH failure should not modify graph', async () => {
      await putGraph(app, 'http://ex.org/atomicity', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const etag = (await getGraph(app, 'http://ex.org/atomicity')).headers.etag;
      const original = (await getGraph(app, 'http://ex.org/atomicity')).text;

      // Invalid PATCH
      try {
        await patchGraph(app, 'http://ex.org/atomicity', 'INVALID SYNTAX', etag);
      } catch {
        // Expected to fail
      }

      const after = (await getGraph(app, 'http://ex.org/atomicity')).text;
      expect(after).toBe(original);
    });

    it('PATCH success should update graph', async () => {
      await putGraph(app, 'http://ex.org/atomicity-success', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const etag = (await getGraph(app, 'http://ex.org/atomicity-success')).headers.etag;

      await patchGraph(
        app,
        'http://ex.org/atomicity-success',
        `INSERT { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new> } WHERE {}`,
        etag,
      );

      const response = await getGraph(app, 'http://ex.org/atomicity-success');
      expect(response.text).toContain('new');
    });

    it('PATCH error codes', async () => {
      await putGraph(app, 'http://ex.org/patch-errors', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const etag = (await getGraph(app, 'http://ex.org/patch-errors')).headers.etag;

      // 400: Malformed PATCH
      await request(app.getHttpServer())
        .patch(`/graph/${encodeURIComponent('http://ex.org/patch-errors')}`)
        .set('Content-Type', 'application/sparql-update')
        .set('If-Match', etag)
        .send('{ invalid }')
        .expect(400);

      // 415: Unsupported Content-Type
      await request(app.getHttpServer())
        .patch(`/graph/${encodeURIComponent('http://ex.org/patch-errors')}`)
        .set('Content-Type', 'application/json')
        .set('If-Match', etag)
        .send('{}')
        .expect(415);

      // 422: Multi-graph PATCH
      await request(app.getHttpServer())
        .patch(`/graph/${encodeURIComponent('http://ex.org/patch-errors')}`)
        .set('Content-Type', 'application/sparql-update')
        .set('If-Match', etag)
        .send('WITH <http://ex.org/g1> INSERT { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> } WHERE {}')
        .expect(422);
    });
  });

  describe('TC-COMP-09: G9 Concurrency Control', () => {
    /**
     * G9: Concurrent operations with If-Match
     */

    it('concurrent PUT with If-Match -> 412 for loser', async () => {
      await putGraph(app, 'http://ex.org/concurrent', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const etag = (await getGraph(app, 'http://ex.org/concurrent')).headers.etag;

      // First PUT succeeds
      await request(app.getHttpServer())
        .put(`/graph/${encodeURIComponent('http://ex.org/concurrent')}`)
        .set('Content-Type', 'text/turtle')
        .set('If-Match', etag)
        .send(`@prefix ex: <http://ex.org/> . ex:s ex:p ex:o2 .`)
        .expect(200);

      // Second PUT with the same (now stale) ETag should fail
      const response2 = await request(app.getHttpServer())
        .put(`/graph/${encodeURIComponent('http://ex.org/concurrent')}`)
        .set('Content-Type', 'text/turtle')
        .set('If-Match', etag)
        .send(`@prefix ex: <http://ex.org/> . ex:s ex:p ex:o3 .`)
        .expect(412);

      expect(response2.status).toBe(412);
    });

    it('concurrent PATCH -> only one succeeds', async () => {
      await putGraph(app, 'http://ex.org/concurrent-patch', `@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const etag = (await getGraph(app, 'http://ex.org/concurrent-patch')).headers.etag;

      // First PATCH
      await patchGraph(
        app,
        'http://ex.org/concurrent-patch',
        `INSERT { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new1> } WHERE {}`,
        etag,
      );

      // Second PATCH with the same (now stale) ETag
      const response = await request(app.getHttpServer())
        .patch(`/graph/${encodeURIComponent('http://ex.org/concurrent-patch')}`)
        .set('Content-Type', 'application/sparql-update')
        .set('If-Match', etag)
        .send(`INSERT { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new2> } WHERE {}`)
        .expect(412);

      expect(response.status).toBe(412);
    });
  });

  describe('TC-COMP-10: default-graph lifecycle (v2, D-4 — DROP DEFAULT semantics)', () => {
    /**
     * Prior to v2, the ONLY default-graph test anywhere in the issue set was
     * GET ?default -> 200. Every other method has default-graph-specific
     * semantics (PUT never 201, DELETE clears-but-keeps-the-row, PATCH's
     * existence check is trivially satisfied) that were entirely untested at
     * the compliance level. This is a regression guard for OQ-13.
     */
    const store = () => request(app.getHttpServer());

    it('PUT, DELETE, then GET ?default: content cleared but graph still exists (200, never 404)', async () => {
      await store()
        .put('/graph-store?default')
        .set('Content-Type', 'text/turtle')
        .send(`@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      const del = await store().delete('/graph-store?default');
      expect([200, 204]).toContain(del.status);
      const get = await store().get('/graph-store?default').set('Accept', 'text/turtle');
      expect(get.status).toBe(200); // OQ-13: never 404
      expect(get.text.trim()).not.toContain('http://ex.org/s'); // content actually cleared
    });

    it('PUT ?default on a previously-cleared default graph never returns 201', async () => {
      await store().delete('/graph-store?default');
      const r = await store()
        .put('/graph-store?default')
        .set('Content-Type', 'text/turtle')
        .send(`@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .`);
      expect(r.status).not.toBe(201);
      expect([200, 204]).toContain(r.status);
    });

    it('PATCH ?default: existence trivially satisfied, missing If-Match -> 428 (not 404)', async () => {
      const r = await store()
        .patch('/graph-store?default')
        .set('Content-Type', 'application/sparql-update')
        .send(`INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }`);
      expect(r.status).toBe(428);
    });
  });
});
