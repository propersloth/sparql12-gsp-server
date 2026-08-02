// tests/unit/observability.spec.ts
// PURPOSE: Unit tests for Pino logging and OpenTelemetry setup
// TEST MATRIX: TC-NFR-05

import pino from 'pino';
import { PinoLogger } from '../../src/common/logging/pino.logger';
import { OtelService } from '../../src/common/logging/otel.service';

describe('Observability', () => {
  describe('PinoLogger', () => {
    /**
     * TC-NFR-05: Structured logging
     */

    it('should output JSON format', () => {
      const logs: any[] = [];
      const logger = new PinoLogger(
        { level: 'info', transport: false },
        { write: (log) => logs.push(JSON.parse(log)) },
      );

      logger.log('info', 'test message');

      expect(logs).toHaveLength(1);
      expect(logs[0]).toHaveProperty('level');
      expect(logs[0]).toHaveProperty('time');
      expect(logs[0].msg).toBe('test message');
    });

    it('should include required fields in log schema', () => {
      const logs: any[] = [];
      const logger = new PinoLogger(
        { level: 'info', transport: false },
        { write: (log) => logs.push(JSON.parse(log)) },
      );

      logger.log('info', 'test', {
        method: 'PUT',
        path: '/graph/http://ex.org/test',
        graphIri: 'http://ex.org/test',
        outcome: 201,
        duration_ms: 45,
      });

      const log = logs[0];
      expect(log.method).toBe('PUT');
      expect(log.path).toBe('/graph/http://ex.org/test');
      expect(log.graphIri).toBe('http://ex.org/test');
      expect(log.outcome).toBe(201);
      expect(log.duration_ms).toBe(45);
    });

    it('should include traceId and spanId when available', () => {
      const logs: any[] = [];
      const logger = new PinoLogger(
        { level: 'info', transport: false },
        { write: (log) => logs.push(JSON.parse(log)) },
      );

      logger.log('info', 'test', {
        traceId: 'abc123',
        spanId: 'def456',
      });

      const log = logs[0];
      expect(log.traceId).toBe('abc123');
      expect(log.spanId).toBe('def456');
    });

    it('should respect log level configuration', () => {
      const logs: any[] = [];
      const logger = new PinoLogger(
        { level: 'error', transport: false },
        { write: (log) => logs.push(JSON.parse(log)) },
      );

      logger.log('info', 'should not appear');
      logger.log('error', 'should appear');

      expect(logs).toHaveLength(1);
      expect(logs[0].msg).toBe('should appear');
    });

    it('should include error stack traces', () => {
      const logs: any[] = [];
      const logger = new PinoLogger(
        { level: 'error', transport: false },
        { write: (log) => logs.push(JSON.parse(log)) },
      );

      const error = new Error('test error');
      logger.error('error occurred', error);

      const log = logs[0];
      expect(log.err).toBeDefined();
      expect(log.err.message).toBe('test error');
      expect(log.err.stack).toBeDefined();
    });

    it('should include timestamp as ISO string', () => {
      const logs: any[] = [];
      const logger = new PinoLogger(
        { level: 'info', transport: false, timestamp: pino.stdTimeFunctions.isoTime },
        { write: (log) => logs.push(JSON.parse(log)) },
      );

      logger.log('info', 'test');

      const log = logs[0];
      expect(log.time).toBeDefined();
      // Should be parseable as ISO date, and round-trip exactly (NFR-06:
      // production LoggingModule configures isoTime, not epoch millis).
      expect(() => new Date(log.time)).not.toThrow();
      expect(new Date(log.time).toISOString()).toBe(log.time);
    });
  });

  describe('OtelService', () => {
    let otelService: OtelService;

    beforeEach(() => {
      otelService = new OtelService({
        enabled: true,
        endpoint: 'http://localhost:4318',
        serviceName: 'gsp-server-test',
        sampleRatio: 1.0,
      });
    });

    it('should extract trace context', () => {
      const context = otelService.extractContext({
        headers: {
          traceparent: '00-abc123-def456-01',
        },
      });

      expect(context).toBeDefined();
    });

    it('should inject trace context into headers', () => {
      const headers: Record<string, string> = {};
      otelService.injectContext(headers);

      expect(headers).toHaveProperty('traceparent');
      expect(headers.traceparent).toMatch(/^00-[a-f0-9-]+-[a-f0-9]+-01$/);
    });

    it('should return empty context when tracing disabled', () => {
      const disabledService = new OtelService({
        enabled: false,
        endpoint: 'http://localhost:4318',
        serviceName: 'gsp-server-test',
        sampleRatio: 1.0,
      });

      const context = disabledService.extractContext({ headers: {} });
      expect(context).toBeNull();
    });

    it('should sample based on sampleRatio', () => {
      // With sampleRatio 1.0, should sample
      const sampledService = new OtelService({
        enabled: true,
        endpoint: 'http://localhost:4318',
        serviceName: 'gsp-server-test',
        sampleRatio: 1.0,
      });

      expect(sampledService.shouldSample()).toBe(true);

      // With sampleRatio 0, should not sample
      const unsampledService = new OtelService({
        enabled: true,
        endpoint: 'http://localhost:4318',
        serviceName: 'gsp-server-test',
        sampleRatio: 0,
      });

      expect(unsampledService.shouldSample()).toBe(false);
    });

    it('should create spans with correct attributes', () => {
      const span = otelService.startSpan('test-operation', {
        'graph.iri': 'http://ex.org/test',
        'http.method': 'GET',
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('should record exceptions in span', () => {
      const span = otelService.startSpan('test-operation');
      const error = new Error('test error');

      otelService.recordException(span, error);

      span.end();
    });
  });
});
