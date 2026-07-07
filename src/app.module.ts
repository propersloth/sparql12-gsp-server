import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createTypeOrmOptions } from './database/database.config';
import { Graph } from './database/entities/graph.entity';
import { Triple } from './database/entities/triple.entity';
import { GraphStoreController } from './graph-store/graph-store.controller';
import { GraphRepository } from './graph-store/repositories/graph.repository';
import { TripleRepository } from './graph-store/repositories/triple.repository';
import { ConcurrencyService } from './graph-store/services/concurrency.service';
import { ContentNegotiationService } from './graph-store/services/content-negotiation.service';
import { ETagService } from './graph-store/services/etag.service';
import { GraphRoutingService } from './graph-store/services/graph-routing.service';
import { GraphStoreService } from './graph-store/services/graph-store.service';
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

const graphStoreImports =
  process.env.GSP_DISABLE_DB === 'true'
    ? []
    : [TypeOrmModule.forFeature([Graph, Triple])];

const graphStoreControllers =
  process.env.GSP_DISABLE_DB === 'true'
    ? []
    : [GraphStoreController];

const graphStoreProviders =
  process.env.GSP_DISABLE_DB === 'true'
    ? []
    : [
        GraphRepository,
        TripleRepository,
        GraphRoutingService,
        ConcurrencyService,
        ETagService,
        GraphStoreService,
      ];

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ...databaseImports, ...graphStoreImports],
  controllers: [HealthController, ...graphStoreControllers],
  providers: [RdfServiceImpl, ContentNegotiationService, ...graphStoreProviders],
})
export class AppModule {}
