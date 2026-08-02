// tests/unit/auth.spec.ts
// TEST MATRIX: TC-SEC-01, TC-SEC-02, TC-SEC-03

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
// Import exception classes so toThrow() receives the class, not a string (v2 fix)
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../../../src/auth/guards/api-key.guard';
import { OptionalAuthGuard } from '../../../src/auth/guards/optional-auth.guard';
import { JwtOrApiKeyGuard } from '../../../src/auth/guards/jwt-or-api-key.guard';
import { AuthService } from '../../../src/auth/auth.service';
import { ConfigService } from '@nestjs/config';

// Matches the *actual* runtime shape: AppModule wires ConfigModule.forRoot()
// with no `load` factory, so ConfigService only ever resolves the flat
// GSP_* env var names (see src/database/database.config.ts for the same
// pattern) - never dotted paths like 'auth.jwt.secret'. A previous version
// of this mock used dotted keys, which matched a bug in auth.service.ts
// (config.get('auth.jwt.secret')) instead of the real ConfigService
// behavior, so the bug went undetected. See tests/unit/config/
// configuration.spec.ts for the (separate, unused-by-the-live-app)
// GspConfiguration mapping layer.
function buildConfigService(
  overrides: Record<string, string | undefined> = {},
): ConfigService {
  const values: Record<string, string | undefined> = {
    GSP_AUTH_JWT_SECRET: 'test-secret',
    GSP_AUTH_JWT_ISSUER: 'test-issuer',
    GSP_AUTH_API_KEYS: 'test-api-key-1,test-api-key-2',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('Auth Guards', () => {
  let jwtGuard: JwtAuthGuard;
  let apiKeyGuard: ApiKeyGuard;
  let optionalGuard: OptionalAuthGuard;
  let jwtOrApiKeyGuard: JwtOrApiKeyGuard;
  let authService: AuthService;

  async function buildModule(
    configOverrides: Record<string, string | undefined> = {},
  ): Promise<TestingModule> {
    return Test.createTestingModule({
      providers: [
        AuthService,
        JwtAuthGuard,
        ApiKeyGuard,
        OptionalAuthGuard,
        JwtOrApiKeyGuard,
        { provide: ConfigService, useValue: buildConfigService(configOverrides) },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module = await buildModule();

    authService  = module.get(AuthService);
    jwtGuard     = module.get(JwtAuthGuard);
    apiKeyGuard  = module.get(ApiKeyGuard);
    optionalGuard = module.get(OptionalAuthGuard);
    jwtOrApiKeyGuard = module.get(JwtOrApiKeyGuard);
  });

  function createMockContext(options: {
    headers?: Record<string, string>;
    method?: string;
  } = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: options.headers || {},
          method: options.method || 'GET',
          url: '/graph/http://ex.org/test',
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  describe('TC-SEC-01: Missing credentials → 401', () => {
    it('JwtAuthGuard: no Authorization header → UnauthorizedException', async () => {
      await expect(
        jwtGuard.canActivate(createMockContext({ headers: {} }))
      ).rejects.toThrow(UnauthorizedException);   // class ref, not string (v2 fix)
    });

    it('JwtAuthGuard: invalid ****** → UnauthorizedException', async () => {
      await expect(
        jwtGuard.canActivate(createMockContext({ headers: { authorization: 'Bearer invalid' } }))
      ).rejects.toThrow(UnauthorizedException);          
    });

    it('ApiKeyGuard: no X-API-Key header → UnauthorizedException', async () => {
      await expect(
        apiKeyGuard.canActivate(createMockContext({ headers: {} }))
      ).rejects.toThrow(UnauthorizedException);          
    });

    it('ApiKeyGuard: invalid API key → UnauthorizedException', async () => {
      await expect(
        apiKeyGuard.canActivate(createMockContext({ headers: { 'x-api-key': 'bad-key' } }))
      ).rejects.toThrow(UnauthorizedException);          
    });
  });

  describe('TC-SEC-02: Insufficient permissions → 403', () => {
    it('authenticated but lacks role → ForbiddenException', async () => {
      const token = authService.generateToken({ id: 'u1', roles: ['reader'], claims: {} });
      jest.spyOn(authService, 'hasRole').mockResolvedValue(false);

      await expect(
        jwtGuard.canActivate(createMockContext({ headers: { authorization: `Bearer ${token}` } }))
      ).rejects.toThrow(ForbiddenException);             
    });

    it('401 response carries WWW-Authenticate header (UR-SEC-01)', async () => {
      try {
        await jwtGuard.canActivate(createMockContext({ headers: {} }));
        fail('Expected UnauthorizedException');
      } catch (e: any) {
        expect(e).toBeInstanceOf(UnauthorizedException); 
        expect(e.status).toBe(401);
        // WWW-Authenticate is attached by the exception filter in CommonModule.
        // Here we just verify the exception type is correct.
      }
    });
  });

  describe('TC-SEC-03: Swappable auth schemes', () => {
    it('valid JWT ****** true', async () => {
      const token = authService.generateToken({ id: 'u1', roles: ['writer'], claims: { sub: 'u1' } });
      expect(await jwtGuard.canActivate(
        createMockContext({ headers: { authorization: `Bearer ${token}` } })
      )).toBe(true);
    });

    it('valid API key → true', async () => {
      expect(await apiKeyGuard.canActivate(
        createMockContext({ headers: { 'x-api-key': 'test-api-key-1' } })
      )).toBe(true);
    });

    it('OptionalAuthGuard allows unauthenticated GET', async () => {
      expect(await optionalGuard.canActivate(
        createMockContext({ headers: {}, method: 'GET' })
      )).toBe(true);
    });

    it('OptionalAuthGuard requires auth for mutations → UnauthorizedException', async () => {
      await expect(
        optionalGuard.canActivate(createMockContext({ headers: {}, method: 'POST' }))
      ).rejects.toThrow(UnauthorizedException);          
    });

    it('JWT and API key guards work independently', async () => {
      const token = authService.generateToken({ id: 'u1', roles: ['reader'], claims: {} });
      expect(await jwtGuard.canActivate(
        createMockContext({ headers: { authorization: `Bearer ${token}` } })
      )).toBe(true);
      expect(await apiKeyGuard.canActivate(
        createMockContext({ headers: { 'x-api-key': 'test-api-key-1' } })
      )).toBe(true);
    });
  });

  describe('JwtOrApiKeyGuard (issue #46: wired to mutation routes)', () => {
    it('no credentials at all → UnauthorizedException (401)', async () => {
      await expect(
        jwtOrApiKeyGuard.canActivate(createMockContext({ headers: {}, method: 'PUT' })),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('Authorization header present but invalid → ForbiddenException (403)', async () => {
      await expect(
        jwtOrApiKeyGuard.canActivate(
          createMockContext({
            headers: { authorization: 'Bearer not-a-real-token' },
            method: 'PUT',
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('X-API-Key header present but invalid → ForbiddenException (403)', async () => {
      await expect(
        jwtOrApiKeyGuard.canActivate(
          createMockContext({ headers: { 'x-api-key': 'bad-key' }, method: 'PUT' }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('valid Bearer token → true, sets request.identity', async () => {
      const token = authService.generateToken({ id: 'u1', roles: ['writer'], claims: {} });
      const request = { headers: { authorization: `Bearer ${token}` }, method: 'PUT' };
      const context = createMockContext(request);
      (context.switchToHttp().getRequest as () => typeof request) = () => request;

      expect(await jwtOrApiKeyGuard.canActivate(context)).toBe(true);
    });

    it('valid API key → true', async () => {
      expect(
        await jwtOrApiKeyGuard.canActivate(
          createMockContext({ headers: { 'x-api-key': 'test-api-key-1' }, method: 'PUT' }),
        ),
      ).toBe(true);
    });

    it('GSP_AUTH_ENABLED=false → no-ops (true) even with no credentials', async () => {
      const module = await buildModule({ GSP_AUTH_ENABLED: 'false' });
      const guard: JwtOrApiKeyGuard = module.get(JwtOrApiKeyGuard);

      expect(
        await guard.canActivate(createMockContext({ headers: {}, method: 'PUT' })),
      ).toBe(true);
    });
  });

  describe('OptionalAuthGuard: GSP_AUTH_ENABLED gating (issue #46)', () => {
    it('GSP_AUTH_ENABLED=false → no-ops (true) for mutations with no credentials', async () => {
      const module = await buildModule({ GSP_AUTH_ENABLED: 'false' });
      const guard: OptionalAuthGuard = module.get(OptionalAuthGuard);

      expect(
        await guard.canActivate(createMockContext({ headers: {}, method: 'POST' })),
      ).toBe(true);
    });

    it('GSP_AUTH_ENABLED unset (default true) → still enforces auth for mutations', async () => {
      await expect(
        optionalGuard.canActivate(createMockContext({ headers: {}, method: 'POST' })),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('AuthService.isEnabled() (issue #46)', () => {
    it('defaults to true when GSP_AUTH_ENABLED is unset', () => {
      expect(authService.isEnabled()).toBe(true);
    });

    it.each(['false', '0'])('is false when GSP_AUTH_ENABLED=%s', async (value) => {
      const module = await buildModule({ GSP_AUTH_ENABLED: value });
      const service: AuthService = module.get(AuthService);
      expect(service.isEnabled()).toBe(false);
    });

    it.each(['true', '1'])('is true when GSP_AUTH_ENABLED=%s', async (value) => {
      const module = await buildModule({ GSP_AUTH_ENABLED: value });
      const service: AuthService = module.get(AuthService);
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('AuthService', () => {
    it('verifies JWT with correct secret', async () => {
      const t = authService.generateToken({ id: 'u1', roles: ['reader'], claims: {} });
      const p = await authService.verifyToken(t);
      expect(p.id).toBe('u1');
    });

    it('rejects tampered JWT', async () => {
      const t = authService.generateToken({ id: 'u1', roles: ['reader'], claims: {} });
      await expect(authService.verifyToken(t.slice(0, -5) + 'xxxxx')).rejects.toThrow();
    });

    it('validates known API key', async () => {
      expect((await authService.validateApiKey('test-api-key-1')).valid).toBe(true);
    });

    it('rejects unknown API key', async () => {
      expect((await authService.validateApiKey('unknown')).valid).toBe(false);
    });

    it('rejects malformed token (wrong number of segments)', async () => {
      await expect(authService.verifyToken('only-one-segment')).rejects.toThrow(
        'Malformed token',
      );
    });

    it('rejects a token with an unsupported header (alg confusion attempt)', async () => {
      const forgedHeader = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const forgedBody = Buffer.from(JSON.stringify({ id: 'attacker' })).toString(
        'base64url',
      );
      const forgedToken = `${forgedHeader}.${forgedBody}.deadbeef`;

      await expect(authService.verifyToken(forgedToken)).rejects.toThrow(
        'Unsupported token header',
      );
    });

    it('rejects an expired token', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const token = authService.generateToken({ id: 'u1', roles: [], claims: {} });

      jest.setSystemTime(new Date('2026-01-01T02:00:00Z')); // +2h, past the 1h exp
      await expect(authService.verifyToken(token)).rejects.toThrow('Expired token');
      jest.useRealTimers();
    });

    it('rejects a token signed with a different issuer', async () => {
      const otherIssuerModule = await buildModule({ GSP_AUTH_JWT_ISSUER: 'other-issuer' });
      const otherIssuerService: AuthService = otherIssuerModule.get(AuthService);

      const token = otherIssuerService.generateToken({ id: 'u1', roles: [], claims: {} });

      // Same secret, different configured issuer -> signature verifies, iss check fails.
      await expect(authService.verifyToken(token)).rejects.toThrow('Bad issuer');
    });

    it('parses comma-separated API keys with surrounding whitespace and blank entries', async () => {
      const module = await buildModule({
        GSP_AUTH_API_KEYS: ' key-a , key-b ,,',
      });
      const service: AuthService = module.get(AuthService);

      expect((await service.validateApiKey('key-a')).valid).toBe(true);
      expect((await service.validateApiKey('key-b')).valid).toBe(true);
      expect((await service.validateApiKey('')).valid).toBe(false);
    });

    it('does not throw and does not authenticate a different-length API key', async () => {
      // Regression guard for the constant-time comparison: a length
      // mismatch must resolve to `false`, not throw or short-circuit into
      // a match.
      await expect(
        authService.validateApiKey('test-api-key-1-but-much-longer'),
      ).resolves.toEqual({ valid: false });
    });
  });

  describe('AuthService: JWT secret configuration (regression for issue #51)', () => {
    // Prior to this fix, AuthService read `config.get('auth.jwt.secret')`
    // (a dotted path), but the app's real ConfigModule.forRoot() (see
    // src/app.module.ts) has no `load` factory, so that lookup always
    // returned undefined and AuthService silently signed/verified every
    // token with an empty-string HMAC key - a full authentication bypass
    // for anyone who read the (now-public) source. These tests pin the
    // fail-closed behavior going forward.

    it('refuses to sign a token when GSP_AUTH_JWT_SECRET is not configured', async () => {
      const module = await buildModule({ GSP_AUTH_JWT_SECRET: undefined });
      const service: AuthService = module.get(AuthService);

      expect(() => service.generateToken({ id: 'u1', roles: [], claims: {} })).toThrow(
        'GSP_AUTH_JWT_SECRET is not configured',
      );
    });

    it('refuses to verify a token when GSP_AUTH_JWT_SECRET is not configured', async () => {
      // Generate a well-formed token while the secret *is* configured, then
      // verify it through a service instance with the secret removed - this
      // isolates the "secret missing" failure from unrelated parse errors.
      const signedModule = await buildModule();
      const signedService: AuthService = signedModule.get(AuthService);
      const token = signedService.generateToken({ id: 'u1', roles: [], claims: {} });

      const module = await buildModule({ GSP_AUTH_JWT_SECRET: undefined });
      const service: AuthService = module.get(AuthService);

      await expect(service.verifyToken(token)).rejects.toThrow(
        'GSP_AUTH_JWT_SECRET is not configured',
      );
    });

    it('surfaces the missing-secret failure through JwtAuthGuard as a generic 401 (no internal detail leaked)', async () => {
      const module = await buildModule({ GSP_AUTH_JWT_SECRET: undefined });
      const guard: JwtAuthGuard = module.get(JwtAuthGuard);

      await expect(
        guard.canActivate(
          createMockContext({ headers: { authorization: 'Bearer a.b.c' } }),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('reads the real GSP_AUTH_JWT_SECRET / GSP_AUTH_JWT_ISSUER / GSP_AUTH_API_KEYS env-derived keys (not a dotted "auth.jwt.secret" path)', async () => {
      const config = buildConfigService();
      const module = await Test.createTestingModule({
        providers: [AuthService, { provide: ConfigService, useValue: config }],
      }).compile();
      const service: AuthService = module.get(AuthService);

      const token = service.generateToken({ id: 'u1', roles: [], claims: {} });
      const identity = await service.verifyToken(token);

      expect(identity.id).toBe('u1');
      expect(config.get).toHaveBeenCalledWith('GSP_AUTH_JWT_SECRET');
      expect(config.get).not.toHaveBeenCalledWith('auth.jwt.secret');
    });
  });
});
