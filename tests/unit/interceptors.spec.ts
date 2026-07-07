import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { TracingInterceptor } from '../../src/common/interceptors/tracing.interceptor';
import { ETagInterceptor } from '../../src/common/interceptors/etag.interceptor';
import { GspExceptionFilter } from '../../src/common/filters/gsp-exception.filter';

describe('Interceptors', () => {
  function createMockContext(options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  } = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: options.method || 'GET',
          url: options.url || '/graph/http://ex.org/test',
          headers: options.headers || {},
        }),
        getResponse: () => ({
          statusCode: 200,
          setHeader: jest.fn(),
          getHeaders: () => ({}),
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function createMockCallHandler(data?: any): CallHandler {
    return { handle: () => of(data) };
  }

  describe('LoggingInterceptor', () => {
    /**
     * TC-NFR-05: Structured logging
     */

    let interceptor: LoggingInterceptor;
    let logger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock; debug: jest.Mock };

    beforeEach(() => {
      logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
      interceptor = new LoggingInterceptor(logger as any);
    });

    it('should log method, path, and duration', async () => {
      const context = createMockContext({ method: 'GET', url: '/graph/http://ex.org/test' });
      const next = createMockCallHandler({ data: 'test' });

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          next: () => resolve(undefined),
          complete: () => resolve(undefined),
        });
      });

      expect(logger.log).toHaveBeenCalled();
      const logCall = logger.log.mock.calls[0][0];
      expect(logCall).toHaveProperty('method');
      expect(logCall).toHaveProperty('path');
      expect(logCall).toHaveProperty('duration_ms');
      expect(logCall.method).toBe('GET');
    });

    it('should include graphIri in log', async () => {
      const context = createMockContext({ method: 'PUT', url: '/graph/http://ex.org/my-graph' });
      const next = createMockCallHandler();

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          next: () => resolve(undefined),
          complete: () => resolve(undefined),
        });
      });

      const logCall = logger.log.mock.calls[0][0];
      expect(logCall).toHaveProperty('graphIri');
    });

    it('should log error on failure', async () => {
      const context = createMockContext({ method: 'GET' });
      const error = new Error('test error');
      const next: CallHandler = { handle: () => throwError(() => error) };

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          error: () => resolve(undefined),
        });
      });

      expect(logger.error).toHaveBeenCalled();
    });

    it('should include outcome status in log', async () => {
      const mockResponse = { statusCode: 201, setHeader: jest.fn(), getHeaders: () => ({}) };
      const context = createMockContext({ method: 'PUT' });
      (context.switchToHttp as any) = () => ({
        getRequest: () => ({ method: 'PUT', url: '/graph/test', headers: {} }),
        getResponse: () => mockResponse,
      });
      const next = createMockCallHandler();

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          next: () => resolve(undefined),
          complete: () => resolve(undefined),
        });
      });

      const logCall = logger.log.mock.calls[0][0];
      expect(logCall).toHaveProperty('outcome');
      expect(logCall.outcome).toBe(201);
    });
  });

  describe('TracingInterceptor', () => {
    it('should create span on request', async () => {
      const interceptor = new TracingInterceptor();
      const context = createMockContext();
      const next = createMockCallHandler();

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          next: () => resolve(undefined),
          complete: () => resolve(undefined),
        });
      });
    });

    it('should record exception on error', async () => {
      const interceptor = new TracingInterceptor();
      const context = createMockContext();
      const error = new Error('trace test');
      const next: CallHandler = { handle: () => throwError(() => error) };

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          error: () => resolve(undefined),
        });
      });
    });
  });

  describe('ETagInterceptor', () => {
    /**
     * TC-HTTP-04: ETag injection
     * UR-CC-03: Vary: Accept on negotiated GET/HEAD responses
     */

    it('should inject ETag header on response', async () => {
      const interceptor = new ETagInterceptor();
      const mockResponse = { statusCode: 200, setHeader: jest.fn(), getHeaders: () => ({}) };
      const context = createMockContext();
      (context.switchToHttp as any) = () => ({
        getRequest: () => ({ method: 'GET', headers: {} }),
        getResponse: () => mockResponse,
      });
      const next = createMockCallHandler({ data: 'test', etag: '"abc.1.text%2Fturtle"' });

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          next: () => resolve(undefined),
          complete: () => resolve(undefined),
        });
      });

      expect(mockResponse.setHeader).toHaveBeenCalledWith('ETag', expect.stringMatching(/^"/));
    });

    it('should not overwrite existing ETag', async () => {
      const existingEtag = '"existing-etag"';
      const mockResponse = {
        statusCode: 200,
        setHeader: jest.fn(),
        getHeaders: () => ({ etag: existingEtag }),
      };
      const context = createMockContext();
      (context.switchToHttp as any) = () => ({
        getRequest: () => ({ method: 'GET', headers: {} }),
        getResponse: () => mockResponse,
      });
      const next = createMockCallHandler({ data: 'test' });
      const interceptor = new ETagInterceptor();

      await new Promise(resolve => {
        interceptor.intercept(context, next).subscribe({
          next: () => resolve(undefined),
          complete: () => resolve(undefined),
        });
      });

      expect(mockResponse.setHeader).toHaveBeenCalledWith('ETag', existingEtag);
    });

    it('should set Vary: Accept on GET responses (UR-CC-03)', async () => {
      const interceptor = new ETagInterceptor();
      const mockResponse = { statusCode: 200, setHeader: jest.fn(), getHeaders: () => ({}) };
      const context = createMockContext({ method: 'GET' });
      (context.switchToHttp as any) = () => ({
        getRequest:  () => ({ method: 'GET',  headers: {} }),
        getResponse: () => mockResponse,
      });

      await new Promise(resolve => {
        interceptor.intercept(context, createMockCallHandler({ data: 'body' })).subscribe({
          complete: () => resolve(undefined),
        });
      });

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Vary', 'Accept');
    });

    it('should set Vary: Accept on HEAD responses', async () => {
      const interceptor = new ETagInterceptor();
      const mockResponse = { statusCode: 200, setHeader: jest.fn(), getHeaders: () => ({}) };
      const context = createMockContext({ method: 'HEAD' });
      (context.switchToHttp as any) = () => ({
        getRequest:  () => ({ method: 'HEAD', headers: {} }),
        getResponse: () => mockResponse,
      });

      await new Promise(resolve => {
        interceptor.intercept(context, createMockCallHandler({})).subscribe({
          complete: () => resolve(undefined),
        });
      });

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Vary', 'Accept');
    });

    it('should NOT set Vary: Accept on PUT/POST/DELETE/PATCH (not negotiated)', async () => {
      for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) {
        const interceptor = new ETagInterceptor();
        const mockResponse = { statusCode: 200, setHeader: jest.fn(), getHeaders: () => ({}) };
        const context = createMockContext({ method });
        (context.switchToHttp as any) = () => ({
          getRequest:  () => ({ method, headers: {} }),
          getResponse: () => mockResponse,
        });

        await new Promise(resolve => {
          interceptor.intercept(context, createMockCallHandler({})).subscribe({
            complete: () => resolve(undefined),
          });
        });

        const varyCalls = mockResponse.setHeader.mock.calls.filter(
          ([h]: string[]) => h.toLowerCase() === 'vary'
        );
        expect(varyCalls).toHaveLength(0);
      }
    });
  });

  describe('GspExceptionFilter', () => {
    let filter: GspExceptionFilter;
    let mockResponse: any;
    let mockRequest: any;

    beforeEach(() => {
      filter = new GspExceptionFilter();
      mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      mockRequest = { url: '/graph/http://ex.org/test' };
    });

    function createMockHost(exception: unknown): any {
      return {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => mockRequest,
        }),
      };
    }

    it('should map ParseException → 400', () => {
      const exception = { name: 'ParseException', message: 'Invalid syntax' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, error: 'ParseException' })
      );
    });

    it('should map InvalidIriException → 400', () => {
      const exception = { name: 'InvalidIriException', message: 'Invalid IRI' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should map GraphNotFoundException → 404', () => {
      const exception = { name: 'GraphNotFoundException', message: 'Graph not found' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should map UnauthorizedException → 401', () => {
      const exception = { name: 'UnauthorizedException', message: 'Unauthorized' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should map ForbiddenException → 403', () => {
      const exception = { name: 'ForbiddenException', message: 'Forbidden' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should map PreconditionFailedException → 412', () => {
      const exception = { name: 'PreconditionFailedException', message: 'Precondition failed' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(412);
    });

    it('should map PreconditionRequiredException → 428', () => {
      const exception = { name: 'PreconditionRequiredException', message: 'Precondition required' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(428);
    });

    it('should map UnsupportedMediaTypeException → 415', () => {
      const exception = { name: 'UnsupportedMediaTypeException', message: 'Unsupported media' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(415);
    });

    it('should map UnprocessableEntityException → 422', () => {
      const exception = { name: 'UnprocessableEntityException', message: 'Unprocessable' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(422);
    });

    it('should map RdfXmlSerializationException → 500, named (not anonymous default) (GSP-004)', () => {
      const exception = {
        name: 'RdfXmlSerializationException',
        message: 'Predicate IRI <http://ex.org/vocab/prefix-only/> cannot be split into an XML QName',
      };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, error: 'RdfXmlSerializationException' })
      );
    });

    it('should include timestamp in response', () => {
      const exception = { name: 'Error', message: 'Unknown error' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: expect.any(String) })
      );
    });

    it('should include path in response', () => {
      const exception = { name: 'Error', message: 'Unknown error' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/graph/http://ex.org/test' })
      );
    });

    it('should default to 500 for unknown exceptions', () => {
      const exception = { name: 'UnknownError', message: 'Something went wrong' };
      filter.catch(exception, createMockHost(exception));
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });
});
