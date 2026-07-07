import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, Optional } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: Pick<Logger, 'log' | 'error' | 'warn' | 'debug'>;

  constructor(@Optional() logger?: Pick<Logger, 'log' | 'error' | 'warn' | 'debug'>) {
    this.logger = logger ?? new Logger('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; url: string }>();
    const response = http.getResponse<{ statusCode: number }>();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.logger.log({
          method,
          path: url,
          outcome: response.statusCode,
          duration_ms: duration,
          graphIri: this.extractGraphIri(url),
          timestamp: new Date().toISOString(),
        });
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error({
          method,
          path: url,
          error: error.message,
          duration_ms: duration,
          graphIri: this.extractGraphIri(url),
          timestamp: new Date().toISOString(),
        });
        throw error;
      }),
    );
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
