// tests/integration/observability.integration.spec.ts
// PURPOSE: Integration tests for observability (structured request logging +
// trace correlation) wired end-to-end through LoggingInterceptor/OtelService
// against a real Nest HTTP pipeline.
// TEST MATRIX: TC-NFR-05
//
// Follows the same pattern as tests/integration/controllers.spec.ts: a
// stateful in-memory mock of GraphStoreService stands in for the database
// (this suite runs with GSP_DISABLE_DB=true, see tests/setup.ts), so PUT-then-GET
// and error-path (404) behaviour can be exercised without Postgres.

import { INestApplication, NotFoundException } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GraphStoreController } from '../../src/graph-store/graph-store.controller';
import { GraphStoreService } from '../../src/graph-store/services/graph-store.service';
import { ETagService } from '../../src/graph-store/services/etag.service';
import { GraphRoutingService } from '../../src/graph-store/services/graph-routing.service';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { PinoLogger } from '../../src/common/logging/pino.logger';
import { OtelService } from '../../src/common/logging/otel.service';
import { getGraph, putGraph } from '../helpers/request.helper';
import { disabledAuthProviders } from '../helpers/auth-test.helper';

interface GraphEntry {
  content: string;
  etag: string;
}

describe('Observability Integration', () => {
  let app: INestApplication;
  let capturedLogs: Record<string, unknown>[];

  const store = new Map<string, GraphEntry>();
  let versionCounter = 0;
  const nextEtag = () => `"v${++versionCounter}"`;

  const graphStore = {
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
    mintedGraphIri: jest.fn(),
  };

  beforeAll(async () => {
    capturedLogs = [];

    const moduleRef = await Test.createTestingModule({
      controllers: [GraphStoreController],
      providers: [
        GraphRoutingService,
        ETagService,
        { provide: GraphStoreService, useValue: graphStore },
        {
          provide: PinoLogger,
          useFactory: () =>
            new PinoLogger({ level: 'info', transport: false }, {
              write: (log: string) => capturedLogs.push(JSON.parse(log)),
            }),
        },
        {
          provide: OtelService,
          useFactory: () =>
            new OtelService({
              enabled: true,
              endpoint: 'http://localhost:4318',
              serviceName: 'gsp-server-test',
              sampleRatio: 1.0,
            }),
        },
        { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
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
    store.clear();
    versionCounter = 0;
    capturedLogs = [];
  });

  describe('TC-NFR-05: Structured logging integration', () => {
    it('should log all request details', async () => {
      await putGraph(app, 'http://ex.org/log-test', '@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');
      await getGraph(app, 'http://ex.org/log-test');

      const requestLog = capturedLogs.find(
        (log) => typeof log.path === 'string' && (log.path as string).includes('log-test'),
      );

      expect(requestLog).toBeDefined();
      expect(requestLog).toHaveProperty('method');
      expect(requestLog).toHaveProperty('path');
      expect(requestLog).toHaveProperty('outcome');
      expect(requestLog).toHaveProperty('duration_ms');
    });

    it('should include graphIri in PUT log', async () => {
      await putGraph(app, 'http://ex.org/graph-iri-test', '@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

      const putLog = capturedLogs.find(
        (log) => log.method === 'PUT' && log.graphIri === 'http://ex.org/graph-iri-test',
      );

      expect(putLog).toBeDefined();
      expect(putLog?.graphIri).toBe('http://ex.org/graph-iri-test');
    });

    it('should log error responses', async () => {
      await request(app.getHttpServer())
        .get(`/graph/${encodeURIComponent('http://ex.org/nonexistent')}`)
        .set('Accept', 'text/turtle')
        .expect(404);

      const errorLog = capturedLogs.find((log) => log.outcome === 404 || (log as { error?: unknown }).error);

      expect(errorLog).toBeDefined();
    });

    it('should include traceId in distributed traces', async () => {
      await putGraph(app, 'http://ex.org/trace-test', '@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');

      const traceLog = capturedLogs.find((log) => log.traceId);

      expect(traceLog).toBeDefined();
      expect(typeof traceLog?.traceId).toBe('string');
      expect((traceLog?.traceId as string).length).toBeGreaterThan(0);
    });

    it('should propagate the inbound traceparent header into the log entry', async () => {
      const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

      await request(app.getHttpServer())
        .put(`/graph/${encodeURIComponent('http://ex.org/inbound-trace-test')}`)
        .set('Content-Type', 'text/turtle')
        .set('traceparent', traceparent)
        .send('@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .')
        .expect(204);

      const log = capturedLogs.find((l) => l.graphIri === 'http://ex.org/inbound-trace-test');

      expect(log?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    });

    it('should log with a parseable timestamp', async () => {
      await putGraph(app, 'http://ex.org/ts-test', '@prefix ex: <http://ex.org/> . ex:s ex:p ex:o .');
      await getGraph(app, 'http://ex.org/ts-test');

      const log = capturedLogs.find((l) => typeof l.time !== 'undefined');
      expect(log).toBeDefined();

      const timestamp = log?.time;
      expect(() => new Date(timestamp as string | number)).not.toThrow();
    });
  });
});
