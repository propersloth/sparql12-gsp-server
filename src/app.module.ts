import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createTypeOrmOptions } from './database/database.config';
import { ContentNegotiationService } from './graph-store/services/content-negotiation.service';
import { HealthController } from './health/health.controller';
import { RdfServiceImpl } from './rdf/rdf.service';

const databaseImports =
  process.env.GSP_DISABLE_DB === 'true'
    ? []
    : [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: createTypeOrmOptions,
        }),
      ];

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ...databaseImports],
  controllers: [HealthController],
  providers: [RdfServiceImpl, ContentNegotiationService],
})
export class AppModule {}
