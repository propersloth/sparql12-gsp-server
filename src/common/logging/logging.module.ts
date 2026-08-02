// src/common/logging/logging.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import pino from 'pino';
import { PinoLogger } from './pino.logger';
import { OtelService } from './otel.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PinoLogger,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): PinoLogger => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        // Default to silent under the test runner (integration tests that
        // want to assert on log output construct their own PinoLogger with
        // an explicit destination — see observability.integration.spec.ts —
        // rather than relying on this app-wide default instance). An
        // explicit GSP_LOG_LEVEL always wins.
        const defaultLevel = nodeEnv === 'test' ? 'silent' : 'info';
        const level = configService.get<string>('GSP_LOG_LEVEL') || defaultLevel;
        // Pretty-print only for local/interactive development. Production
        // wants raw JSON on stdout (NFR-06).
        const usePrettyTransport = nodeEnv !== 'production' && nodeEnv !== 'test';

        return new PinoLogger({
          level,
          transport: usePrettyTransport
            ? { target: 'pino-pretty', options: { colorize: true } }
            : false,
          formatters: {
            level: (label) => ({ level: label }),
          },
          timestamp: pino.stdTimeFunctions.isoTime,
        });
      },
    },
    {
      provide: OtelService,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): OtelService => {
        return new OtelService({
          enabled: configService.get<string>('GSP_OTEL_ENABLED') === 'true',
          endpoint:
            configService.get<string>('GSP_OTEL_ENDPOINT') || 'http://localhost:4318',
          serviceName: configService.get<string>('GSP_OTEL_SERVICE_NAME') || 'gsp-server',
          sampleRatio: parseFloat(
            configService.get<string>('GSP_OTEL_SAMPLE_RATIO') || '1.0',
          ),
        });
      },
    },
  ],
  exports: [PinoLogger, OtelService],
})
export class LoggingModule {}
