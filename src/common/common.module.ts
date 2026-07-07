import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TracingInterceptor } from './interceptors/tracing.interceptor';
import { ETagInterceptor } from './interceptors/etag.interceptor';
import { GspExceptionFilter } from './filters/gsp-exception.filter';

@Global()
@Module({
  providers: [
    LoggingInterceptor,
    TracingInterceptor,
    ETagInterceptor,
    GspExceptionFilter,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TracingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ETagInterceptor },
    { provide: APP_FILTER, useClass: GspExceptionFilter },
  ],
  exports: [LoggingInterceptor, TracingInterceptor, ETagInterceptor, GspExceptionFilter],
})
export class CommonModule {}
