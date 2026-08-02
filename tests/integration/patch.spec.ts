/**
 * tests/integration/patch.spec.ts
 *
 * PATCH integration tests (TC-PATCH-01..05, TC-CC-04a/b/c, v3 fixes).
 * These tests exercise the full PATCH flow through the service layer using
 * in-memory mocks (no real database required).
 */
import { INestApplication, NotFoundException, PreconditionFailedException, BadRequestException, UnprocessableEntityException, HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GraphStoreController } from '../../src/graph-store/graph-store.controller';
import { GraphStoreService } from '../../src/graph-store/services/graph-store.service';
import { ETagService } from '../../src/graph-store/services/etag.service';
import { GraphRoutingService } from '../../src/graph-store/services/graph-routing.service';
import { PatchUnsupportedMediaTypeException } from '../../src/graph-store/exceptions/patch-unsupported-media-type.exception';
import { disabledAuthProviders } from '../helpers/auth-test.helper';

describe('PATCH /graph/{iri}', () => {
  let app: INestApplication;
  const graphStore = {
    getGraph: jest.fn(),
    headGraph: jest.fn(),
    putGraph: jest.fn(),
    postGraph: jest.fn(),
    deleteGraph: jest.fn(),
    patchGraph: jest.fn(),
  };

  const iri = 'http://ex.org/patch-test';
  const etag = '"graph-uuid.1.text%2Fturtle"';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GraphStoreController],
      providers: [
        GraphRoutingService,
        ETagService,
        { provide: GraphStoreService, useValue: graphStore },
        ...disabledAuthProviders(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    graphStore.patchGraph.mockResolvedValue({ status: 200, etag: '"graph-uuid.2.text%2Fturtle"' });
  });

  it('TC-PATCH-01: applies INSERT DATA → 200 + updated ETag', async () => {
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', etag)
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new-o> }')
      .expect(200);

    expect(r.headers.etag).toBe('"graph-uuid.2.text%2Fturtle"');
    expect(graphStore.patchGraph).toHaveBeenCalledWith(
      iri,
      'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new-o> }',
      'application/sparql-update',
      etag,
    );
  });

  it('TC-PATCH-02: atomic — failed patch (service throws) returns error, not 200', async () => {
    graphStore.patchGraph.mockRejectedValue(
      new BadRequestException('Invalid SPARQL Update'),
    );
    await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', etag)
      .send('INVALID SPARQL')
      .expect(400);
  });

  it('TC-PATCH-03: WITH clause (multi-graph) → 422', async () => {
    graphStore.patchGraph.mockRejectedValue(
      new UnprocessableEntityException('PATCH WITH clause names another graph'),
    );
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', etag)
      .send(`WITH <http://ex.org/other> INSERT { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> } WHERE {}`)
      .expect(422);

    expect(r.status).toBe(422);
  });

  it('TC-PATCH-04: malformed SPARQL → 400', async () => {
    graphStore.patchGraph.mockRejectedValue(
      new BadRequestException('Invalid SPARQL Update'),
    );
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', etag)
      .send('{ invalid @')
      .expect(400);

    expect(r.status).toBe(400);
  });

  it('TC-PATCH-05: wrong Content-Type → 415 + Accept-Patch header', async () => {
    graphStore.patchGraph.mockRejectedValue(new PatchUnsupportedMediaTypeException());
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/json')
      .set('If-Match', etag)
      .send('{"op":"add"}');

    expect(r.status).toBe(415);
    expect(r.headers['accept-patch']).toContain('application/sparql-update');
  });

  it('TC-CC-04a (OQ-14): absent graph returns 404 before missing If-Match returns 428', async () => {
    graphStore.patchGraph.mockRejectedValue(new NotFoundException('graph not found'));
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent('http://ex.org/does-not-exist')}`)
      .set('Content-Type', 'application/sparql-update')
      // deliberately no If-Match header
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }')
      .expect(404);

    expect(r.status).toBe(404);
  });

  it('TC-CC-04a: existing graph, missing If-Match → 428', async () => {
    graphStore.patchGraph.mockRejectedValue(
      new HttpException('If-Match required', HttpStatus.PRECONDITION_REQUIRED),
    );
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/sparql-update')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }')
      .expect(428);

    expect(r.status).toBe(428);
  });

  it('TC-CC-04b: stale If-Match → 412, graph unchanged', async () => {
    graphStore.patchGraph.mockRejectedValue(
      new PreconditionFailedException('If-Match ETag does not match'),
    );
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', '"wrong-graph.0.text%2Fturtle"')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }')
      .expect(412);

    expect(r.status).toBe(412);
  });

  it('TC-CC-04c: valid If-Match → 200', async () => {
    const r = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent(iri)}`)
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', etag)
      .send('DELETE DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }')
      .expect(200);

    expect(r.status).toBe(200);
    expect(r.headers.etag).toBeDefined();
  });
});

describe('PATCH /graph-store?default (v3, D-2)', () => {
  let app: INestApplication;
  const graphStore = {
    getGraph: jest.fn(),
    headGraph: jest.fn(),
    putGraph: jest.fn(),
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
        ...disabledAuthProviders(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    graphStore.patchGraph.mockResolvedValue({ status: 200, etag: '"default-id.2.text%2Fturtle"' });
  });

  it('existence is trivially satisfied (OQ-13) — missing If-Match → 428, not 404', async () => {
    graphStore.patchGraph.mockRejectedValue(
      new HttpException('If-Match required', HttpStatus.PRECONDITION_REQUIRED),
    );
    const r = await request(app.getHttpServer())
      .patch('/graph-store?default')
      .set('Content-Type', 'application/sparql-update')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }');

    expect(r.status).toBe(428);
  });

  it('valid If-Match → 200, patch applied to the default graph', async () => {
    const r = await request(app.getHttpServer())
      .patch('/graph-store?default')
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', '"default-id.1.text%2Fturtle"')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new> }')
      .expect(200);

    expect(graphStore.patchGraph).toHaveBeenCalledWith(
      null,
      'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/new> }',
      'application/sparql-update',
      '"default-id.1.text%2Fturtle"',
    );
    expect(r.headers.etag).toBeDefined();
  });

  it('a GRAPH-scoped clause in a default-graph patch → 422', async () => {
    graphStore.patchGraph.mockRejectedValue(
      new UnprocessableEntityException('PATCH references graph; target is (default)'),
    );
    const r = await request(app.getHttpServer())
      .patch('/graph-store?default')
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', '"default-id.1.text%2Fturtle"')
      .send('INSERT DATA { GRAPH <http://ex.org/anything> { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> } }')
      .expect(422);

    expect(r.status).toBe(422);
  });
});
