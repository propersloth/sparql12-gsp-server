import 'reflect-metadata';
// Must be imported before AppModule (and everything it pulls in) so that
// OpenTelemetry auto-instrumentation can patch http/express/pg before those
// modules are first required. No-ops unless GSP_OTEL_ENABLED=true.
import './tracing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PinoLogger } from './common/logging/pino.logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger).asNestLogger());

  const port = Number(process.env.PORT);
  await app.listen(Number.isFinite(port) && port > 0 ? port : 3000);
}

void bootstrap();
