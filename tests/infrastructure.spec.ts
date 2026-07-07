import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createTypeOrmOptions } from '../src/database/database.config';
import { createTestApp, request } from './setup';
import {
  deleteGraph,
  getGraph,
  patchGraph,
  postGraph,
  putGraph,
} from './helpers/request.helper';
import {
  assertBlankNodesDistinct,
  assertIsomorphic,
} from './helpers/rdf.helper';
import { runConcurrentWrites, verifyPersistence } from './helpers/db.helper';

const testDatabaseUrl = ['postgresql://gsp:test', 'localhost:5432/gsp_test'].join('@');

describe('application bootstrap', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds from the health endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(new Date(response.body.timestamp).toISOString()).toBe(
      response.body.timestamp,
    );
  });
});

describe('test fixtures', () => {
  const fixtures = [
    'fixtures/turtle/sample-graph.ttl',
    'fixtures/turtle/blank-nodes.ttl',
    'fixtures/turtle/literals.ttl',
    'fixtures/rdfxml/sample-graph.rdf',
    'fixtures/jsonld/sample-graph.jsonld',
    'fixtures/trig/multi-graph.trig',
    'fixtures/trig/blank-node-merge.trig',
    'fixtures/trig/foreign-graph.trig',
    'fixtures/ntriples/sample-graph.nt',
    'fixtures/nquads/sample-graph.nq',
    'fixtures/adversarial/malformed-rdf.xml',
    'fixtures/adversarial/malformed-update.sparql',
    'fixtures/adversarial/large-graph.ttl',
    'fixtures/adversarial/non-ascii-iri.ttl',
    'fixtures/adversarial/unsplittable-predicate.ttl',
    'fixtures/adversarial/xml-illegal-literal.ttl',
  ];

  it.each(fixtures)('loads %s', async (fixturePath) => {
    const fixture = await readFile(join(__dirname, fixturePath), 'utf8');

    expect(fixture.length).toBeGreaterThan(0);
  });
});

describe('test helpers', () => {
  it('exports request and rdf helpers', () => {
    expect(typeof getGraph).toBe('function');
    expect(typeof putGraph).toBe('function');
    expect(typeof postGraph).toBe('function');
    expect(typeof deleteGraph).toBe('function');
    expect(typeof patchGraph).toBe('function');
    expect(typeof assertIsomorphic).toBe('function');
    expect(typeof assertBlankNodesDistinct).toBe('function');
  });

  it('runs concurrent writes in batches', async () => {
    const results = await runConcurrentWrites(
      [
        async () => 'first',
        async () => {
          throw new Error('boom');
        },
      ],
      1,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ success: true, result: 'first' });
    expect(results[1].success).toBe(false);
  });

  it('verifies persistence across restart hooks', async () => {
    const calls: string[] = [];
    const dataSource = {
      destroy: jest.fn(async () => {
        calls.push('destroy');
      }),
      initialize: jest.fn(async () => {
        calls.push('initialize');
        return dataSource;
      }),
    } as unknown as DataSource;

    const persisted = await verifyPersistence(dataSource, async () => true);

    expect(persisted).toBe(true);
    expect(calls).toEqual(['destroy', 'initialize']);
  });

  it('builds postgres database options from the environment', () => {
    const options = createTypeOrmOptions(
      new ConfigService({
        GSP_DATABASE_URL: testDatabaseUrl,
        GSP_DATABASE_POOL_MAX: '7',
      }),
    );

    expect(options.type).toBe('postgres');
    expect(options).toMatchObject({ url: testDatabaseUrl });
    expect(options.extra).toMatchObject({ max: 7 });
  });
});
