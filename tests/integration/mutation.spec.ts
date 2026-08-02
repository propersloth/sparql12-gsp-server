import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GraphStoreController } from '../../src/graph-store/graph-store.controller';
import { GraphStoreService } from '../../src/graph-store/services/graph-store.service';
import { ETagService } from '../../src/graph-store/services/etag.service';
import { GraphRoutingService } from '../../src/graph-store/services/graph-routing.service';
import { disabledAuthProviders } from '../helpers/auth-test.helper';

describe('GraphStoreController mutation wiring', () => {
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
    graphStore.getGraph.mockResolvedValue({
      status: 200,
      content: 'ttl',
      contentType: 'text/turtle',
      etag: '"g.1.text%2Fturtle"',
    });
    graphStore.headGraph.mockResolvedValue({
      contentType: 'text/turtle',
      etag: '"g.1.text%2Fturtle"',
    });
    graphStore.putGraph.mockResolvedValue({ status: 204, etag: '"mut"' });
    graphStore.postGraph.mockResolvedValue({ status: 201, etag: '"mut"', location: 'http://api/graphs/x' });
    graphStore.deleteGraph.mockResolvedValue({ status: 204, etag: '"mut"' });
    graphStore.patchGraph.mockResolvedValue({ status: 200, etag: '"mut"' });
  });

  it('GET /graph/:iri returns negotiated headers and body', async () => {
    const response = await request(app.getHttpServer())
      .get(`/graph/${encodeURIComponent('http://ex.org/g')}`)
      .set('Accept', 'text/turtle')
      .expect(200);

    expect(graphStore.getGraph).toHaveBeenCalledWith('http://ex.org/g', 'text/turtle', undefined);
    expect(response.text).toBe('ttl');
    expect(response.headers.etag).toBe('"g.1.text%2Fturtle"');
    expect(response.headers.vary).toBe('Accept');
  });

  it('PUT /graph-store?default passes null target and extracted preconditions', async () => {
    await request(app.getHttpServer())
      .put('/graph-store?default')
      .set('Content-Type', 'text/turtle')
      .set('If-Match', 'W/"weak", "graph.7.text%2Fturtle"')
      .set('If-None-Match', '*')
      .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .')
      .expect(204);

    expect(graphStore.putGraph).toHaveBeenCalledWith(
      null,
      Buffer.from('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .'),
      'text/turtle',
      { ifMatch: '"graph.7.text%2Fturtle"', ifNoneMatch: '*' },
    );
  });

  it('POST /graph-store with no target mints instead of writing the default graph', async () => {
    await request(app.getHttpServer())
      .post('/graph-store')
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .')
      .expect(201);

    expect(graphStore.postGraph).toHaveBeenCalledWith(
      Buffer.from('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .'),
      'text/turtle',
      undefined,
      undefined,
    );
  });

  it('POST /graph-store?default routes explicitly to the default graph', async () => {
    await request(app.getHttpServer())
      .post('/graph-store?default')
      .set('Content-Type', 'text/turtle')
      .send('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .')
      .expect(201);

    expect(graphStore.postGraph).toHaveBeenCalledWith(
      Buffer.from('@prefix ex:<http://ex.org/>. ex:s ex:p ex:o .'),
      'text/turtle',
      null,
      undefined,
    );
  });

  it('multipart POST forwards all uploaded RDF parts to the service', async () => {
    await request(app.getHttpServer())
      .post(`/graph/${encodeURIComponent('http://ex.org/mp')}`)
      .attach('part1', Buffer.from('@prefix ex:<http://ex.org/>. ex:s1 ex:p ex:o1 .'), {
        filename: 'p1.ttl',
        contentType: 'text/turtle',
      })
      .attach('part2', Buffer.from('@prefix ex:<http://ex.org/>. ex:s2 ex:p ex:o2 .'), {
        filename: 'p2.ttl',
        contentType: 'text/turtle',
      })
      .expect(201);

    expect(graphStore.postGraph).toHaveBeenCalledWith(
      Buffer.alloc(0),
      expect.stringContaining('multipart/form-data'),
      'http://ex.org/mp',
      [
        expect.objectContaining({
          filename: 'p1.ttl',
          contentType: 'text/turtle',
          buffer: Buffer.from('@prefix ex:<http://ex.org/>. ex:s1 ex:p ex:o1 .'),
        }),
        expect.objectContaining({
          filename: 'p2.ttl',
          contentType: 'text/turtle',
          buffer: Buffer.from('@prefix ex:<http://ex.org/>. ex:s2 ex:p ex:o2 .'),
        }),
      ],
    );
  });

  it('DELETE /graph-store?default passes null target and strong If-Match only', async () => {
    await request(app.getHttpServer())
      .delete('/graph-store?default')
      .set('If-Match', 'W/"weak", "graph.9.text%2Fturtle"')
      .expect(204);

    expect(graphStore.deleteGraph).toHaveBeenCalledWith(null, {
      ifMatch: '"graph.9.text%2Fturtle"',
      ifNoneMatch: undefined,
    });
  });

  it('PATCH /graph/:iri passes iri, body, content-type, and raw If-Match to the service', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent('http://ex.org/g')}`)
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', '"g.1.text%2Fturtle"')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }')
      .expect(200);

    expect(graphStore.patchGraph).toHaveBeenCalledWith(
      'http://ex.org/g',
      'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      'application/sparql-update',
      '"g.1.text%2Fturtle"',
    );
    expect(response.headers.etag).toBe('"mut"');
  });

  it('PATCH /graph-store?default passes null target to the service', async () => {
    await request(app.getHttpServer())
      .patch('/graph-store?default')
      .set('Content-Type', 'application/sparql-update')
      .set('If-Match', '"g.1.text%2Fturtle"')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }')
      .expect(200);

    expect(graphStore.patchGraph).toHaveBeenCalledWith(
      null,
      'INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }',
      'application/sparql-update',
      '"g.1.text%2Fturtle"',
    );
  });

  it('PATCH without If-Match header passes undefined to the service', async () => {
    graphStore.patchGraph.mockRejectedValue(Object.assign(new Error('If-Match required'), { status: 428 }));
    await request(app.getHttpServer())
      .patch(`/graph/${encodeURIComponent('http://ex.org/g')}`)
      .set('Content-Type', 'application/sparql-update')
      .send('INSERT DATA { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> }');

    expect(graphStore.patchGraph).toHaveBeenCalledWith(
      'http://ex.org/g',
      expect.any(String),
      'application/sparql-update',
      undefined,
    );
  });
});
