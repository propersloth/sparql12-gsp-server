/**
 * tests/integration/headers.spec.ts
 *
 * Integration tests for HTTP response headers (UR-CC-03).
 * Verifies that ETagInterceptor sets Vary: Accept on GET/HEAD responses.
 */
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { GraphStoreController } from '../../src/graph-store/graph-store.controller';
import { GraphStoreService } from '../../src/graph-store/services/graph-store.service';
import { ETagService } from '../../src/graph-store/services/etag.service';
import { GraphRoutingService } from '../../src/graph-store/services/graph-routing.service';
import { ETagInterceptor } from '../../src/common/interceptors/etag.interceptor';
import { getGraph, putGraph } from '../helpers/request.helper';

interface GraphEntry {
  content: string;
  etag: string;
}

const store = new Map<string, GraphEntry>();
let versionCounter = 0;

function nextEtag(): string {
  return `"v${++versionCounter}"`;
}

const graphStore = {
  mintedGraphIri: jest.fn(),

  getGraph: jest.fn(async (iri: string | null) => {
    const key = iri ?? '__default__';
    const entry = store.get(key);
    if (!entry) throw new NotFoundException('Graph not found');
    return { status: 200 as const, content: entry.content, contentType: 'text/turtle', etag: entry.etag };
  }),

  headGraph: jest.fn(async (iri: string | null) => {
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

  postGraph: jest.fn(),
  deleteGraph: jest.fn(),
  patchGraph: jest.fn(),
};

describe('HTTP response headers', () => {
  let app: INestApplication;

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
    app.useGlobalInterceptors(new ETagInterceptor());
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

  it('GET response carries Vary: Accept header (UR-CC-03)', async () => {
    await putGraph(app, 'http://ex.org/vary-test', `@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .`);
    const r = await getGraph(app, 'http://ex.org/vary-test');
    expect(r.headers.vary).toContain('Accept');
  });
});
