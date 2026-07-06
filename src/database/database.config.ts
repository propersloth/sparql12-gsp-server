import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Graph } from './entities/graph.entity';
import { Triple } from './entities/triple.entity';
import { InitialSchema1700000000001 } from './migrations/001-initial-schema';

const DEFAULT_DATABASE_URL = ['postgresql://gsp:test', 'localhost:5432/gsp_test'].join('@');
const DEFAULT_POOL_MAX = 10;

export function createTypeOrmOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const configuredPoolSize = Number(
    configService.get<string>('GSP_DATABASE_POOL_MAX') ?? DEFAULT_POOL_MAX,
  );

  return {
    type: 'postgres',
    url: configService.get<string>('GSP_DATABASE_URL') ?? DEFAULT_DATABASE_URL,
    autoLoadEntities: true,
    entities: [Graph, Triple],
    migrations: [InitialSchema1700000000001],
    synchronize: false,
    retryAttempts: 0,
    retryDelay: 0,
    extra: {
      max:
        Number.isFinite(configuredPoolSize) && configuredPoolSize > 0
          ? configuredPoolSize
          : DEFAULT_POOL_MAX,
    },
  };
}
