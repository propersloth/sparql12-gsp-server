/**
 * tests/integration/controllers.spec.ts
 *
 * Controller routing tests (TC-HTTP-01/03/05, v2).
 * Uses a stateful in-memory mock of GraphStoreService so that stateful tests
 * (PUT then GET, POST-to-store then GET minted location, DELETE then 404) can
 * be exercised without a real database.
 *
 * See GSP-030 for the full acceptance-criteria checklist.
 */
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request = require('supertest');
import { GraphStoreController } from '../../src/graph-store/graph-store.controller';
import { buildMintedGraphIri, GraphStoreService } from '../../src/graph-store/services/graph-store.service';
import { ETagService } from '../../src/graph-store/services/etag.service';
import { GraphRoutingService } from '../../src/graph-store/services/graph-routing.service';
import { getGraph, putGraph } from '../helpers/request.helper';

// ── Stateful in-memory store ──────────────────────────────────────────────────
// Allows tests that PUT/POST and then read back to work without a real DB.

interface GraphEntry {
  content: string;
  etag: string;
}

const store = new Map<string, GraphEntry>();
let versionCounter = 0;
const baseUrl = 'http://localhost:3000';

function nextEtag(): string {
  return `"v${++versionCounter}"`;
}

function mintedGraphIri(uuid: string): string {
  return buildMintedGraphIri(baseUrl, uuid);
}

const graphStore = {
  mintedGraphIri: jest.fn(mintedGraphIri),

  getGraph: jest.fn(async (iri: string | null, _accept?: string, _ifNoneMatch?: string) => {
    const key = iri ?? '__default__';
    const entry = store.get(key);
    if (!entry) throw new NotFoundException('Graph not found');
    return { status: 200 as const, content: entry.content, contentType: 'text/turtle', etag: entry.etag };
  }),

  headGraph: jest.fn(async (iri: string | null, _accept?: string) => {
    const key = iri ?? '__default__';
    const entry = store.get(key);
    if (!entry) throw new NotFoundException('Graph not found');
    return { contentType: 'text/turtle', etag: entry.etag };
  }),

  putGraph: jest.fn(async (iri: string | null, body: Buffer, _contentType: string) => {
    const key = iri ?? '__default__';
    const etag = nextEtag();
    store.set(key, { content: body.toString(), etag });
    return { status: 204 as const, etag };
  }),

  postGraph: jest.fn(async (body: Buffer, _contentType: string, targetIri: string | null | undefined) => {
    if (targetIri === undefined) {
      const uuid = randomUUID();
      const location = mintedGraphIri(uuid);
      const etag = nextEtag();
      store.set(location, { content: body.toString(), etag });
      return { status: 201 as const, location, etag };
    }
    const key = targetIri ?? '__default__';
    const existing = store.get(key);
    if (!existing) throw new NotFoundException('Graph not found');
    const etag = nextEtag();
    store.set(key, { content: existing.content + '\n' + body.toString(), etag });
    return { status: 200 as const, etag };
  }),

  deleteGraph: jest.fn(async (iri: string | null) => {
    store.delete(iri ?? '__default__');
    return { status: 204 as const };
  }),

  patchGraph: jest.fn(async (iri: string | null, body: string) => {
    const key = iri ?? '__default__';
    const entry = store.get(key);
    if (!entry) throw new NotFoundException('Graph not found');
    const etag = nextEtag();
    store.set(key, { content: entry.content + '\n' + body, etag });
    return { status: 200 as const, etag };
  }),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('GraphStoreController routing', () => {
  let app: INestApplication;

  const rawRequest = (method: string, path: string) => new request.Test(app.getHttpServer(), method, path);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GraphStoreController],
      providers: [
        GraphRoutingService,
        ETagService,
        { provide: GraphStoreService, useValue: graphStore },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.clear();
    versionCounter = 0;
    jest.clearAllMocks();
  });

  // ── TC-HTTP-01: basic method coverage ─────────────────────────────────────

  describe('TC-HTTP-01: basic method coverage', () => {
    it('GET /graph/{iri} → 200 with content', async () => {
      await putGraph(app, 'http://ex.org/tc01', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const r = await getGraph(app, 'http://ex.org/tc01');
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('text/turtle');
      expect(r.headers.etag).toBeDefined();
    });

    it('HEAD /graph/{iri} → 200, no body', async () => {
      await putGraph(app, 'http://ex.org/tc01-head', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const r = await request(app.getHttpServer())
        .head(`/graph/${encodeURIComponent('http://ex.org/tc01-head')}`)
        .set('Accept', 'text/turtle');
      expect(r.status).toBe(200);
      expect(r.headers.etag).toBeDefined();
    });

    it('PUT /graph/{iri} → 204', async () => {
      const r = await putGraph(app, 'http://ex.org/tc01-put', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      expect(r.status).toBe(204);
    });

    it('DELETE /graph/{iri} → 204', async () => {
      await putGraph(app, 'http://ex.org/tc01-del', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const r = await request(app.getHttpServer())
        .delete(`/graph/${encodeURIComponent('http://ex.org/tc01-del')}`);
      expect(r.status).toBe(204);
    });

    it('GET /graph-store?graph={iri} → 200 (indirect)', async () => {
      await putGraph(app, 'http://ex.org/tc01-indirect', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const r = await request(app.getHttpServer())
        .get(`/graph-store?graph=${encodeURIComponent('http://ex.org/tc01-indirect')}`)
        .set('Accept', 'text/turtle');
      expect(r.status).toBe(200);
    });
  });

  // ── TC-HTTP-03 extension: unsupported verbs → 405 + Allow (v2, corrected) ──

  describe('TC-HTTP-03 extension: unsupported verbs → 405 + Allow (v2, corrected)', () => {
    /**
     * UR-HTTP-03 (MUST): unsupported method on a known resource → 405,
     * response MUST include Allow header.
     * NestJS/Express default is 404 for unmatched methods — this verifies
     * the catch-all handler overrides that.
     */

    it('an unregistered verb on /graph/{iri} → 405 with Allow header', async () => {
      await putGraph(app, 'http://ex.org/405-test', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const r = await rawRequest('TRACE', `/graph/${encodeURIComponent('http://ex.org/405-test')}`);
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBeDefined();
      expect(r.headers.allow).toContain('GET');
      expect(r.headers.allow).toContain('POST');
    });

    it('v2 (C2 fix): POST /graph/{iri} is now registered — no longer falls through to 405', async () => {
      await putGraph(app, 'http://ex.org/post-route-test', '@prefix ex:<http://ex.org/>. ex:s1 ex:p ex:o1 .');
      const r = await request(app.getHttpServer())
        .post(`/graph/${encodeURIComponent('http://ex.org/post-route-test')}`)
        .set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s2 ex:p ex:o2 .');
      expect(r.status).not.toBe(405);
      expect([200, 204]).toContain(r.status);
    });

    it('v2 (corrected): DELETE /graph-store with no ?graph or ?default → 400, NOT 405', async () => {
      // @Delete('graph-store') IS registered on this controller; Express/Nest routing
      // ignores the query string, so this reaches the handler, not the 405 catch-all.
      const r = await request(app.getHttpServer()).delete('/graph-store');
      expect(r.status).toBe(400);
    });

    it('v2 (D-2): PATCH /graph-store?graph= is now registered (was 405 in v1)', async () => {
      await putGraph(app, 'http://ex.org/patch-indirect', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const etag = (await getGraph(app, 'http://ex.org/patch-indirect')).headers.etag;
      const r = await request(app.getHttpServer())
        .patch(`/graph-store?graph=${encodeURIComponent('http://ex.org/patch-indirect')}`)
        .set('Content-Type', 'application/sparql-update')
        .set('If-Match', etag)
        .send('INSERT DATA { <http://ex.org/s2> <http://ex.org/p2> <http://ex.org/o2> }');
      expect(r.status).not.toBe(405);
      expect(r.status).toBe(200);
    });
  });

  // ── v2 (D-2): POST /graph-store branches on resolved target ─────────────────

  describe('v2 (D-2): POST /graph-store branches on resolved target', () => {
    it('no query param → mint (201 + Location)', async () => {
      const r = await request(app.getHttpServer())
        .post('/graph-store').set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      expect(r.status).toBe(201);
      expect(r.headers.location).toBeDefined();
    });

    it('?graph= → merge into that named graph, no Location', async () => {
      await putGraph(app, 'http://ex.org/post-indirect', '@prefix ex:<http://ex.org/>. ex:s1 ex:p ex:o1 .');
      const r = await request(app.getHttpServer())
        .post(`/graph-store?graph=${encodeURIComponent('http://ex.org/post-indirect')}`)
        .set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s2 ex:p ex:o2 .');
      expect([200, 204]).toContain(r.status);
      expect(r.headers.location).toBeUndefined();
    });

    it('?default → merge into the default graph, no Location, no mint', async () => {
      store.set('__default__', { content: '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .', etag: '"v0"' });
      const r = await request(app.getHttpServer())
        .post('/graph-store?default').set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      expect([200, 204]).toContain(r.status);
      expect(r.headers.location).toBeUndefined();
    });
  });

  // ── v2 (D-3): direct route for minted graphs ──────────────────────────────

  describe('v2 (D-3): direct route for minted graphs', () => {
    it('the Location returned by POST-to-store is directly GET-able', async () => {
      const mint = await request(app.getHttpServer())
        .post('/graph-store').set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const location = mint.headers.location as string;
      const path = new URL(location).pathname;   // e.g. /graphs/{uuid}
      const r = await request(app.getHttpServer()).get(path).set('Accept', 'text/turtle');
      expect(r.status).toBe(200);
      expect(r.text).toBeDefined();
    });

    it('DELETE on the minted route removes it; subsequent GET → 404', async () => {
      const mint = await request(app.getHttpServer())
        .post('/graph-store').set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const path = new URL(mint.headers.location as string).pathname;
      await request(app.getHttpServer()).delete(path);
      expect((await request(app.getHttpServer()).get(path)).status).toBe(404);
    });

    it('an unregistered verb on /graphs/{uuid} → 405 with Allow header', async () => {
      const mint = await request(app.getHttpServer())
        .post('/graph-store').set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const path = new URL(mint.headers.location as string).pathname;
      const r = await rawRequest('TRACE', path);
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBeDefined();
    });
  });

  // ── v2 (H4 fix): OPTIONS sets real HTTP headers, not a JSON body ───────────

  describe('v2 (H4 fix): OPTIONS sets real HTTP headers, not a JSON body', () => {
    it('OPTIONS /graph/{iri} — Allow and Accept-Patch are actual response headers', async () => {
      await putGraph(app, 'http://ex.org/opts-test', '@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const r = await request(app.getHttpServer())
        .options(`/graph/${encodeURIComponent('http://ex.org/opts-test')}`);
      expect(r.status).toBe(204);
      expect(r.headers.allow).toContain('GET');
      expect(r.headers.allow).toContain('POST');       // v2 (C2 fix)
      expect(r.headers['accept-patch']).toContain('application/sparql-update');
      // v1 regression this guards against: Allow/Accept-Patch as JSON body instead of headers.
      expect(r.body).toEqual({});
    });

    it('OPTIONS /graph-store — Allow includes PATCH (v2, D-2)', async () => {
      const r = await request(app.getHttpServer()).options('/graph-store');
      expect(r.status).toBe(204);
      expect(r.headers.allow).toContain('PATCH');
      expect(r.headers['accept-patch']).toContain('application/sparql-update');
    });

    it('OPTIONS /graphs/{uuid} — same Allow/Accept-Patch contract as /graph/{iri}', async () => {
      const mint = await request(app.getHttpServer())
        .post('/graph-store').set('Content-Type', 'text/turtle')
        .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .');
      const path = new URL(mint.headers.location as string).pathname;
      const r = await request(app.getHttpServer()).options(path);
      expect(r.status).toBe(204);
      expect(r.headers.allow).toBeDefined();
    });
  });
});
