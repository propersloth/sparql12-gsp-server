import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, Optional } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { PinoLogger } from '../logging/pino.logger';
import { OtelService } from '../logging/otel.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: Pick<Logger, 'log' | 'error' | 'warn' | 'debug'>;

  constructor(
    @Optional() logger?: Pick<Logger, 'log' | 'error' | 'warn' | 'debug'>,
    // Structured (Pino) logging + trace correlation, wired up in production
    // via LoggingModule (@Global()). Both stay optional so this interceptor
    // remains constructible — with the pre-GSP-040 fallback behaviour — in
    // isolation, as tests/unit/interceptors.spec.ts does.
    @Optional() private readonly pinoLogger?: PinoLogger,
    @Optional() private readonly otelService?: OtelService,
  ) {
    this.logger = logger ?? new Logger('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; url: string; headers?: Record<string, string> }>();
    const response = http.getResponse<{ statusCode: number }>();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.emit('log', {
          method,
          path: url,
          outcome: response.statusCode,
          duration_ms: duration,
          graphIri: this.extractGraphIri(url),
          timestamp: new Date().toISOString(),
        }, request, 'Request completed');
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.emit('error', {
          method,
          path: url,
          error: error.message,
          duration_ms: duration,
          graphIri: this.extractGraphIri(url),
          timestamp: new Date().toISOString(),
        }, request, 'Request failed');
        throw error;
      }),
    );
  }

  private emit(
    level: 'log' | 'error',
    payload: Record<string, unknown>,
    request: { headers?: Record<string, string> },
    message: string,
  ): void {
    const trace = this.otelService?.currentTraceContext({ headers: request.headers ?? {} });
    const enriched = trace ? { ...payload, traceId: trace.traceId, spanId: trace.spanId } : payload;

    if (this.pinoLogger) {
      this.pinoLogger.log(level === 'error' ? 'error' : 'info', message, enriched);
      return;
    }

    if (level === 'error') {
      this.logger.error(enriched);
    } else {
      this.logger.log(enriched);
    }
  }

  private extractGraphIri(url: string): string | undefined {
    const match = url.match(/\/graph\/(.+)$/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    return undefined;
  }
}
