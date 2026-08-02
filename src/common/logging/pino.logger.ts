// src/common/logging/pino.logger.ts
//
// Structured JSON logger built on Pino (NFR-06). Wraps a `pino.Logger`
// instance behind a small, Nest-friendly API so call sites can log with a
// consistent `LogContext` shape (method/path/graphIri/outcome/duration_ms/
// traceId/spanId) instead of freeform strings.
import type { LoggerService } from '@nestjs/common';
import pino from 'pino';

export interface LogContext {
  method?: string;
  path?: string;
  graphIri?: string;
  outcome?: number;
  duration_ms?: number;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// `pino.LoggerOptions['transport']` does not accept `false`, but callers
// (including the RED-phase test suite) legitimately want to say "no
// transport" without constructing a full TransportSingleOptions object.
export type PinoLoggerOptions = Omit<pino.LoggerOptions, 'transport'> & {
  transport?: pino.LoggerOptions['transport'] | false;
};

export class PinoLogger {
  private readonly logger: pino.Logger;

  constructor(
    options: PinoLoggerOptions = { level: 'info' },
    destination?: pino.DestinationStream,
  ) {
    const { transport, ...rest } = options;
    const pinoOptions: pino.LoggerOptions = {
      ...rest,
      ...(transport ? { transport } : {}),
    };

    this.logger = destination ? pino(pinoOptions, destination) : pino(pinoOptions);
  }

  log(level: LogLevel, message: string, context?: LogContext): void {
    this.logger[level](context || {}, message);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (error) {
      this.logger.error(
        { ...context, err: { message: error.message, stack: error.stack } },
        message,
      );
    } else {
      this.logger.error(context || {}, message);
    }
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context || {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context || {}, message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context || {}, message);
  }

  child(bindings: Record<string, unknown>): PinoLogger {
    const childInstance = Object.create(PinoLogger.prototype) as PinoLogger;
    (childInstance as unknown as { logger: pino.Logger }).logger = this.logger.child(bindings);
    return childInstance;
  }

  /**
   * Adapts this PinoLogger to Nest's `LoggerService` contract so it can be
   * passed to `app.useLogger(...)` — Nest calls `log(message, ...params)`
   * with a bare string message and trailing "context" string (the calling
   * class name), which does not match PinoLogger's own
   * `log(level, message, context)` signature.
   */
  asNestLogger(): LoggerService {
    return new NestPinoLoggerAdapter(this);
  }
}

class NestPinoLoggerAdapter implements LoggerService {
  constructor(private readonly pinoLogger: PinoLogger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.info(stringify(message), toContext(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    // Nest calls error(message, trace?, context?) — the last string param is
    // the caller's context name; anything before it (if present) is a stack trace.
    const context = toContext(optionalParams);
    const traceParam = optionalParams.find((p) => typeof p === 'string' && p !== context?.context);
    this.pinoLogger.log('error', stringify(message), {
      ...context,
      ...(traceParam ? { stack: traceParam } : {}),
    });
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.warn(stringify(message), toContext(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.debug(stringify(message), toContext(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.log('trace', stringify(message), toContext(optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.pinoLogger.log('fatal', stringify(message), toContext(optionalParams));
  }
}

function stringify(message: unknown): string {
  return typeof message === 'string' ? message : JSON.stringify(message);
}

function toContext(optionalParams: unknown[]): LogContext | undefined {
  const context = [...optionalParams].reverse().find((p) => typeof p === 'string') as
    | string
    | undefined;
  return context ? { context } : undefined;
}
