export interface DatabaseConfig {
  url: string;
}

export interface ServerConfig {
  baseUrl: string;
  maxPayloadSizeBytes: number;
  streamThresholdBytes: number;
  patchEnabled: boolean;
}

export interface AuthConfig {
  enabled: boolean;
  jwt: { secret: string };
  apiKeys: string[];
}

export interface OtelConfig {
  enabled: boolean;
  endpoint: string;
  serviceName: string;
}

export interface GspConfiguration {
  database: DatabaseConfig;
  server: ServerConfig;
  auth: AuthConfig;
  observability: { otel: OtelConfig };
}
