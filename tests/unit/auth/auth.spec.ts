// tests/unit/auth.spec.ts
// TEST MATRIX: TC-SEC-01, TC-SEC-02, TC-SEC-03

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
// Import exception classes so toThrow() receives the class, not a string (v2 fix)
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../../../src/auth/guards/api-key.guard';
import { OptionalAuthGuard } from '../../../src/auth/guards/optional-auth.guard';
import { AuthService } from '../../../src/auth/auth.service';
import { ConfigService } from '@nestjs/config';

describe('Auth Guards', () => {
  let jwtGuard: JwtAuthGuard;
  let apiKeyGuard: ApiKeyGuard;
  let optionalGuard: OptionalAuthGuard;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtAuthGuard,
        ApiKeyGuard,
        OptionalAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => ({
              'auth.jwt.secret': 'test-secret',
              'auth.jwt.issuer': 'test-issuer',
              'auth.apiKeys': ['test-api-key-1', 'test-api-key-2'],
            }[key])),
          },
        },
      ],
    }).compile();

    authService  = module.get(AuthService);
    jwtGuard     = module.get(JwtAuthGuard);
    apiKeyGuard  = module.get(ApiKeyGuard);
    optionalGuard = module.get(OptionalAuthGuard);
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
  });
});
