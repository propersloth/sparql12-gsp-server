import {
  IsNotEmpty,
  IsUrl,
  IsBoolean,
  IsString,
  IsOptional,
  ValidateIf,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class GspEnvironmentVariables {
  @IsNotEmpty({ message: 'GSP_DATABASE_URL is required' })
  databaseUrl!: string;

  @IsOptional()
  @IsUrl({}, { message: 'GSP_BASE_URL must be a valid URL' })
  baseUrl?: string = 'http://localhost:3000';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  authEnabled?: boolean;

  @ValidateIf((o) => o.authEnabled !== false)
  @IsNotEmpty({ message: 'GSP_AUTH_JWT_SECRET is required when auth is enabled' })
  jwtSecret?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? value.split(',') : []))
  @IsString({ each: true })
  apiKeys?: string[] = [];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  patchEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  otelEnabled?: boolean;

  @IsOptional()
  @IsUrl({}, { message: 'GSP_OTEL_ENDPOINT must be a valid URL' })
  otelEndpoint?: string = 'http://localhost:4318';

  @IsOptional()
  @IsString()
  otelServiceName?: string = 'gsp-server';

  @IsOptional()
  @Matches(/^\d+(\.\d+)?(MB|GB|KB)?$/i, {
    message: 'GSP_MAX_PAYLOAD_SIZE must be: 100MB, 1GB, etc.',
  })
  maxPayloadSize?: string = '100MB';

  @IsOptional()
  @Matches(/^\d+(\.\d+)?(MB|GB|KB)?$/i, {
    message: 'GSP_STREAM_THRESHOLD must be: 10MB, 1GB, etc.',
  })
  streamThreshold?: string = '10MB';

  // GSP_DEFAULT_GRAPH_PERSISTENT is NOT mapped — it is retired.
  // The default graph always persists as a seeded sentinel row.
}
