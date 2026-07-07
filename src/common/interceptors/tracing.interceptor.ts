import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

interface Span {
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}

const SpanStatusCode = { OK: 1, ERROR: 2 } as const;

function noopSpan(): Span {
  return { setStatus: () => undefined, end: () => undefined };
}

function startSpan(name: string): Span {
  try {
    // Use a dynamic require so that the missing @opentelemetry/api package
    // does not cause a compile-time error — it is an optional runtime dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const otel = require('@opentelemetry/api') as {
      trace: { getTracer(name: string): { startSpan(op: string): Span } };
    };
    return otel.trace.getTracer('graph-store').startSpan(name);
  } catch {
    return noopSpan();
  }
}

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const request = ctx.switchToHttp().getRequest<{ method: string; url: string }>();
    const span = startSpan(`${request.method} ${request.url}`);

    return next.handle().pipe(
      tap(() => {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }),
      catchError((error) => {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        span.end();
        throw error;
      }),
    );
  }
}
