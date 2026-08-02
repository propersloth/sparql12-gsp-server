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

  // Run onModuleDestroy/beforeApplicationShutdown hooks (e.g. closing the
  // TypeORM connection) on SIGTERM/SIGINT, so container orchestrators
  // (Docker, Compose, Kubernetes) get a clean shutdown instead of a hard
  // kill. See Dockerfile's STOPSIGNAL SIGTERM.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT);
  await app.listen(Number.isFinite(port) && port > 0 ? port : 3000);
}

void bootstrap();
