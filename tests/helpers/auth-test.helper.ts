// tests/helpers/auth-test.helper.ts
//
// Shared provider sets for wiring the auth guards (issue #46) into the
// bare `controllers: [GraphStoreController]` testing modules used across
// tests/integration/*.spec.ts. Those modules don't go through AppModule
// (see src/app.module.ts: GraphStoreController is conditionally omitted
// when GSP_DISABLE_DB=true, which tests/setup.ts always sets), so each one
// must provide AuthService/ConfigService/the guards itself once the
// controller declares @UseGuards(...).
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/auth/auth.service';
import { ApiKeyGuard } from '../../src/auth/guards/api-key.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../../src/auth/guards/jwt-or-api-key.guard';
import { OptionalAuthGuard } from '../../src/auth/guards/optional-auth.guard';

function buildConfigServiceMock(values: Record<string, string | undefined>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

/**
 * Providers for suites that predate issue #46 and aren't testing auth
 * enforcement (routing, headers, PATCH semantics, observability, ...) -
 * GSP_AUTH_ENABLED=false keeps every guard a no-op so those pre-existing
 * unauthenticated requests keep behaving exactly as before.
 */
export function disabledAuthProviders(): Provider[] {
  return [
    AuthService,
    JwtAuthGuard,
    ApiKeyGuard,
    OptionalAuthGuard,
    JwtOrApiKeyGuard,
    { provide: ConfigService, useValue: buildConfigServiceMock({ GSP_AUTH_ENABLED: 'false' }) },
  ];
}

/**
 * Providers for suites that DO exercise real auth enforcement
 * (tests/integration/auth-enforcement.spec.ts): GSP_AUTH_ENABLED left
 * enabled (default true) with a real, known JWT secret and API key so
 * requests can present valid or invalid credentials.
 */
export function enabledAuthProviders(
  overrides: Record<string, string | undefined> = {},
): Provider[] {
  const values: Record<string, string | undefined> = {
    GSP_AUTH_JWT_SECRET: 'test-secret-issue-46',
    GSP_AUTH_JWT_ISSUER: 'gsp-server',
    GSP_AUTH_API_KEYS: 'valid-test-api-key',
    ...overrides,
  };
  return [
    AuthService,
    JwtAuthGuard,
    ApiKeyGuard,
    OptionalAuthGuard,
    JwtOrApiKeyGuard,
    { provide: ConfigService, useValue: buildConfigServiceMock(values) },
  ];
}
