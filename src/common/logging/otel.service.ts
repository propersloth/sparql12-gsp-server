// src/common/logging/otel.service.ts
//
// Thin wrapper around the OpenTelemetry trace API (NFR-05). Owns:
//  - a private (non-global) NodeTracerProvider sampled at `sampleRatio`, so
//    span/trace IDs generated here are real and independent of whatever
//    tracer provider `src/tracing.ts` registers globally for auto-instrumentation;
//  - W3C traceparent extraction/injection for propagating context across
//    process boundaries (GSP requests, outbound calls);
//  - span lifecycle helpers used by TracingInterceptor.
import {
  Context,
  ROOT_CONTEXT,
  Span,
  SpanStatusCode,
  Tracer,
  defaultTextMapGetter,
  defaultTextMapSetter,
  trace,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

export interface OtelConfig {
  enabled: boolean;
  endpoint: string;
  serviceName: string;
  sampleRatio: number;
}

export interface TraceContext {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
}

export interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
}

const propagator = new W3CTraceContextPropagator();

export class OtelService {
  readonly enabled: boolean;
  private readonly sampleRatio: number;
  private readonly tracerProvider?: NodeTracerProvider;
  private readonly tracer?: Tracer;

  constructor(config: OtelConfig) {
    this.enabled = config.enabled;
    this.sampleRatio = config.sampleRatio;

    if (this.enabled) {
      // A dedicated provider (not registered globally) keeps this service's
      // span/trace-id generation self-contained and testable — it does not
      // depend on, or interfere with, whatever provider src/tracing.ts wires
      // up for OTLP export.
      this.tracerProvider = new NodeTracerProvider({
        sampler: new TraceIdRatioBasedSampler(this.sampleRatio),
      });
      this.tracer = this.tracerProvider.getTracer(config.serviceName);
    }
  }

  extractContext(request: IncomingRequest): TraceContext | null {
    if (!this.enabled) return null;

    const extracted: Context = propagator.extract(
      ROOT_CONTEXT,
      request.headers,
      defaultTextMapGetter,
    );
    const spanContext = trace.getSpanContext(extracted);
    if (!spanContext) return null;

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
    };
  }

  injectContext(headers: Record<string, string>): void {
    if (!this.enabled || !this.tracer) return;

    const activeSpan = trace.getActiveSpan();
    let ctx: Context = activeSpan ? trace.setSpan(ROOT_CONTEXT, activeSpan) : ROOT_CONTEXT;
    let ownedSpan: Span | undefined;

    if (!trace.getSpanContext(ctx)) {
      // No active span to propagate — mint one so downstream calls still
      // receive a valid, correlated traceparent.
      ownedSpan = this.tracer.startSpan('context-propagation');
      ctx = trace.setSpan(ROOT_CONTEXT, ownedSpan);
    }

    propagator.inject(ctx, headers, defaultTextMapSetter);
    ownedSpan?.end();
  }

  /**
   * Returns the trace context for the current request: extracted from an
   * inbound `traceparent` header when present, otherwise a freshly minted
   * one (so every log line stays correlated to *some* trace even for the
   * first hop, before any upstream propagation exists). Returns null when
   * tracing is disabled.
   */
  currentTraceContext(request: IncomingRequest): TraceContext | null {
    const extracted = this.extractContext(request);
    if (extracted || !this.enabled || !this.tracer) return extracted;

    const span = this.tracer.startSpan('request-context');
    const spanContext = span.spanContext();
    span.end();

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
    };
  }

  shouldSample(): boolean {
    if (!this.enabled) return false;
    return Math.random() < this.sampleRatio;
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    if (!this.enabled || !this.tracer) {
      return noopSpan();
    }
    return this.tracer.startSpan(name, { attributes });
  }

  recordException(span: Span, error: Error): void {
    if (!this.enabled) return;
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  async shutdown(): Promise<void> {
    await this.tracerProvider?.shutdown();
  }
}

function noopSpan(): Span {
  return {
    end: () => undefined,
    recordException: () => undefined,
    setStatus: () => undefined,
    setAttribute: () => noopSpan(),
    setAttributes: () => noopSpan(),
    addEvent: () => noopSpan(),
    updateName: () => noopSpan(),
    isRecording: () => false,
    spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
    recordExceptionEvent: () => undefined,
  } as unknown as Span;
}
