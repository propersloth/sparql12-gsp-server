import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GspEnvironmentVariables } from './configuration.schema';
import { GspConfiguration as IGspConfiguration } from './configuration.interfaces';
import { parsePayloadSize } from './configuration.transform';

export class GspConfiguration implements IGspConfiguration {
  database!: { url: string };
  server!: {
    baseUrl: string;
    maxPayloadSizeBytes: number;
    streamThresholdBytes: number;
    patchEnabled: boolean;
  };
  auth!: { enabled: boolean; jwt: { secret: string }; apiKeys: string[] };
  observability!: {
    otel: { enabled: boolean; endpoint: string; serviceName: string };
  };

  static async fromEnvironment(
    env: Record<string, string | undefined>,
  ): Promise<GspConfiguration> {
    const schema = plainToInstance(GspEnvironmentVariables, {
      databaseUrl: env.GSP_DATABASE_URL,
      baseUrl: env.GSP_BASE_URL,
      authEnabled: env.GSP_AUTH_ENABLED,
      jwtSecret: env.GSP_AUTH_JWT_SECRET,
      apiKeys: env.GSP_AUTH_API_KEYS,
      patchEnabled: env.GSP_PATCH_ENABLED,
      otelEnabled: env.GSP_OTEL_ENABLED,
      otelEndpoint: env.GSP_OTEL_ENDPOINT,
      otelServiceName: env.GSP_OTEL_SERVICE_NAME,
      maxPayloadSize: env.GSP_MAX_PAYLOAD_SIZE,
      streamThreshold: env.GSP_STREAM_THRESHOLD,
      // GSP_DEFAULT_GRAPH_PERSISTENT deliberately not mapped (retired)
    });
    const errors = await validate(schema);
    if (errors.length) {
      throw new Error(
        `Config validation failed: ${errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ')}`,
      );
    }
    return new GspConfiguration(schema);
  }

  constructor(env: GspEnvironmentVariables) {
    this.database = { url: env.databaseUrl };
    this.server = {
      baseUrl: env.baseUrl ?? 'http://localhost:3000',
      maxPayloadSizeBytes: parsePayloadSize(env.maxPayloadSize ?? '100MB'),
      streamThresholdBytes: parsePayloadSize(env.streamThreshold ?? '10MB'),
      patchEnabled: env.patchEnabled ?? true,
    };
    this.auth = {
      enabled: env.authEnabled !== false,
      jwt: { secret: env.jwtSecret ?? '' },
      apiKeys: env.apiKeys ?? [],
    };
    this.observability = {
      otel: {
        enabled: env.otelEnabled ?? false,
        endpoint: env.otelEndpoint ?? 'http://localhost:4318',
        serviceName: env.otelServiceName ?? 'gsp-server',
      },
    };
  }
}
