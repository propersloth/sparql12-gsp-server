import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Optional } from '@nestjs/common';
import type { Span } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { OtelService } from '../logging/otel.service';

const SpanStatusCode = { OK: 1, ERROR: 2 } as const;

function noopSpan(): Span {
  return { setStatus: () => undefined, end: () => undefined } as unknown as Span;
}

function startSpanViaGlobalApi(name: string): Span {
  try {
    // Use a dynamic require so that a missing @opentelemetry/api package does
    // not cause a compile-time error — it is only reached when OtelService
    // has not been injected (e.g. this interceptor constructed in isolation,
    // as tests/unit/interceptors.spec.ts does).
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
  constructor(
    // Optional so this interceptor stays constructible with zero args, as
    // tests/unit/interceptors.spec.ts does — production wiring comes from
    // LoggingModule (@Global()) via CommonModule.
    @Optional() private readonly otelService?: OtelService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const request = ctx.switchToHttp().getRequest<{ method: string; url: string }>();
    const spanName = `${request.method} ${request.url}`;
    const span: Span = this.otelService
      ? this.otelService.startSpan(spanName, { 'http.method': request.method, 'http.url': request.url })
      : startSpanViaGlobalApi(spanName);

    return next.handle().pipe(
      tap(() => {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }),
      catchError((error) => {
        if (this.otelService) {
          this.otelService.recordException(span, error as Error);
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        }
        span.end();
        throw error;
      }),
    );
  }
}
