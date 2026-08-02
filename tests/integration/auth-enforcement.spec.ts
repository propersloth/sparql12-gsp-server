/**
 * tests/integration/auth-enforcement.spec.ts
 *
 * Issue #46: PUT/POST/PATCH/DELETE on the graph store MUST be
 * authenticated (JwtOrApiKeyGuard); GET/HEAD stay open (OptionalAuthGuard
 * read bypass). Exercises the real guards + the global GspExceptionFilter
 * (for the WWW-Authenticate header, UR-SEC-01) end-to-end through
 * supertest, using the same stateful in-memory GraphStoreService mock
 * pattern as tests/integration/controllers.spec.ts so PUT-then-GET can be
 * exercised without a real database.
 */
import { APP_FILTER } from '@nestjs/core';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GraphStoreController } from '../../src/graph-store/graph-store.controller';
import { GraphStoreService } from '../../src/graph-store/services/graph-store.service';
import { ETagService } from '../../src/graph-store/services/etag.service';
import { GraphRoutingService } from '../../src/graph-store/services/graph-routing.service';
import { AuthService } from '../../src/auth/auth.service';
import { GspExceptionFilter } from '../../src/common/filters/gsp-exception.filter';
import { enabledAuthProviders } from '../helpers/auth-test.helper';

interface GraphEntry {
  content: string;
  etag: string;
}

describe('Auth enforcement on mutation routes (issue #46)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let validTestToken: string;

  const store = new Map<string, GraphEntry>();
  let versionCounter = 0;
  const nextEtag = () => `"v${++versionCounter}"`;

  const graphStore = {
    mintedGraphIri: jest.fn(),
    getGraph: jest.fn(async (iri: string | null) => {
      const entry = store.get(iri ?? '__default__');
      if (!entry) throw new NotFoundException('Graph not found');
      return { status: 200 as const, content: entry.content, contentType: 'text/turtle', etag: entry.etag };
    }),
    headGraph: jest.fn(async (iri: string | null) => {
      const entry = store.get(iri ?? '__default__');
      if (!entry) throw new NotFoundException('Graph not found');
      return { contentType: 'text/turtle', etag: entry.etag };
    }),
    putGraph: jest.fn(async (iri: string | null, body: Buffer) => {
      const etag = nextEtag();
      store.set(iri ?? '__default__', { content: body.toString(), etag });
      return { status: 204 as const, etag };
    }),
    postGraph: jest.fn(),
    deleteGraph: jest.fn(async (iri: string | null) => {
      store.delete(iri ?? '__default__');
      return { status: 204 as const };
    }),
    patchGraph: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GraphStoreController],
      providers: [
        GraphRoutingService,
        ETagService,
        { provide: GraphStoreService, useValue: graphStore },
        { provide: APP_FILTER, useClass: GspExceptionFilter },
        ...enabledAuthProviders(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    authService = moduleRef.get(AuthService);
    validTestToken = authService.generateToken({ id: 'u1', roles: ['writer'], claims: {} });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.clear();
    versionCounter = 0;
    jest.clearAllMocks();
  });

  it('PUT without credentials returns 401', async () => {
    const r = await request(app.getHttpServer())
      .put('/graph/' + encodeURIComponent('http://ex.org/unauth-put'))
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toBeDefined();
  });

  it('PUT with invalid credentials returns 403', async () => {
    const r = await request(app.getHttpServer())
      .put('/graph/' + encodeURIComponent('http://ex.org/forbidden-put'))
      .set('Authorization', 'Bearer not-a-real-token')
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect(r.status).toBe(403);
  });

  it('GET without credentials still succeeds (read bypass)', async () => {
    const r = await request(app.getHttpServer())
      .get('/graph/' + encodeURIComponent('http://ex.org/public-read'));

    expect([200, 404]).toContain(r.status);
    expect(r.status).not.toBe(401);
  });

  it('HEAD without credentials still succeeds (read bypass)', async () => {
    const r = await request(app.getHttpServer())
      .head('/graph/' + encodeURIComponent('http://ex.org/public-read-head'));

    expect(r.status).not.toBe(401);
  });

  it('PUT with valid Bearer credentials succeeds', async () => {
    const r = await request(app.getHttpServer())
      .put('/graph/' + encodeURIComponent('http://ex.org/auth-put'))
      .set('Authorization', `Bearer ${validTestToken}`)
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect([200, 201, 204]).toContain(r.status);
  });

  it('PUT with a valid API key succeeds', async () => {
    const r = await request(app.getHttpServer())
      .put('/graph/' + encodeURIComponent('http://ex.org/auth-put-apikey'))
      .set('X-API-Key', 'valid-test-api-key')
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect([200, 201, 204]).toContain(r.status);
  });

  it('PUT with an invalid API key returns 403', async () => {
    const r = await request(app.getHttpServer())
      .put('/graph/' + encodeURIComponent('http://ex.org/forbidden-put-apikey'))
      .set('X-API-Key', 'wrong-key')
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect(r.status).toBe(403);
  });

  it('DELETE without credentials returns 401', async () => {
    const r = await request(app.getHttpServer())
      .delete('/graph/' + encodeURIComponent('http://ex.org/unauth-delete'));

    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toBeDefined();
  });

  it('PATCH without credentials returns 401', async () => {
    const r = await request(app.getHttpServer())
      .patch('/graph/' + encodeURIComponent('http://ex.org/unauth-patch'))
      .set('Content-Type', 'application/sparql-update')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }');

    expect(r.status).toBe(401);
  });

  it('POST without credentials returns 401', async () => {
    const r = await request(app.getHttpServer())
      .post('/graph/' + encodeURIComponent('http://ex.org/unauth-post'))
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect(r.status).toBe(401);
  });

  it('PUT to the indirect /graph-store route without credentials returns 401', async () => {
    const r = await request(app.getHttpServer())
      .put('/graph-store?graph=' + encodeURIComponent('http://ex.org/indirect-unauth'))
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect(r.status).toBe(401);
  });
});

describe('Auth enforcement respects GSP_AUTH_ENABLED=false (issue #46)', () => {
  let app: INestApplication;
  const store = new Map<string, GraphEntry>();
  let versionCounter = 0;
  const nextEtag = () => `"v${++versionCounter}"`;

  const graphStore = {
    mintedGraphIri: jest.fn(),
    getGraph: jest.fn(),
    headGraph: jest.fn(),
    putGraph: jest.fn(async (iri: string | null, body: Buffer) => {
      const etag = nextEtag();
      store.set(iri ?? '__default__', { content: body.toString(), etag });
      return { status: 204 as const, etag };
    }),
    postGraph: jest.fn(),
    deleteGraph: jest.fn(),
    patchGraph: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GraphStoreController],
      providers: [
        GraphRoutingService,
        ETagService,
        { provide: GraphStoreService, useValue: graphStore },
        { provide: APP_FILTER, useClass: GspExceptionFilter },
        ...enabledAuthProviders({ GSP_AUTH_ENABLED: 'false' }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PUT without credentials succeeds when auth is disabled', async () => {
    const r = await request(app.getHttpServer())
      .put('/graph/' + encodeURIComponent('http://ex.org/auth-disabled-put'))
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

    expect([200, 201, 204]).toContain(r.status);
  });
});
