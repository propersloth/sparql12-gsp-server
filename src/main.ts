import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT);
  await app.listen(Number.isFinite(port) && port > 0 ? port : 3000);
}

void bootstrap();
