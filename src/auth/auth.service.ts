import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyValidation, Identity } from './auth.types';

interface TokenPayload {
  id: string;
  roles?: string[];
  claims?: Record<string, unknown>;
  iss?: string;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  generateToken(identity: Identity): string {
    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    return this.signToken({
      id: identity.id,
      roles: identity.roles,
      claims: identity.claims,
      iss: this.issuer,
      exp: issuedAtSeconds + 60 * 60,
    });
  }

  async verifyToken(token: string): Promise<Identity> {
    const payload = this.parseAndVerifyToken(token);

    if (payload.iss !== this.issuer) {
      throw new Error('Bad issuer');
    }

    if (payload.exp !== undefined && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Expired token');
    }

    return {
      id: payload.id,
      roles: payload.roles ?? [],
      claims: payload.claims ?? {},
    };
  }

  async validateApiKey(key: string): Promise<ApiKeyValidation> {
    const valid = this.apiKeys.some((candidate) => this.constantTimeEquals(candidate, key));

    if (!valid) {
      return { valid: false };
    }

    return {
      valid: true,
      identity: {
        id: 'api-key',
        roles: ['api'],
        claims: { scheme: 'api-key' },
      },
    };
  }

  /**
   * GSP_AUTH_ENABLED gate (issue #46). Defaults to enabled - only an
   * explicit 'false'/'0' turns enforcement off, mirroring the semantics of
   * GspConfiguration/GspEnvironmentVariables' authEnabled transform (see
   * src/config/configuration.schema.ts) even though that mapping layer is
   * not itself wired into the live ConfigService (see the NOTE on `secret`
   * below). Guards call this directly so GSP_AUTH_ENABLED=false disables
   * enforcement without any route-level code change.
   */
  isEnabled(): boolean {
    const raw = this.config.get<string | boolean>('GSP_AUTH_ENABLED');
    if (raw === undefined || raw === null || raw === '') {
      return true;
    }
    return !(raw === false || raw === 'false' || raw === '0');
  }

  async hasRole(identity: Identity, _role?: string): Promise<boolean> {
    if (!identity) {
      return false;
    }

    if (!_role) {
      return true;
    }

    return identity.roles.includes(_role);
  }

  // NOTE: AppModule wires ConfigModule.forRoot({ isGlobal: true }) with no
  // `load` factory (see src/database/database.config.ts for the same flat
  // access pattern), so ConfigService only resolves the literal env var
  // names below - it does NOT resolve dotted paths like 'auth.jwt.secret'
  // into a nested object. GspConfiguration.fromEnvironment (src/config/
  // configuration.ts) builds that nested/validated shape but is never fed
  // back into the live ConfigService, so it cannot be relied on here.
  private get secret(): string {
    const value = this.config.get<string>('GSP_AUTH_JWT_SECRET');
    if (!value) {
      // Fail closed: signing or verifying with an empty-string HMAC key is
      // equivalent to no authentication at all, since the key is trivially
      // guessable (it's the empty string) by anyone who has read the
      // source - which is everyone, since this repo is public.
      throw new Error(
        'GSP_AUTH_JWT_SECRET is not configured. Refusing to sign or verify tokens with an empty secret.',
      );
    }
    return value;
  }

  private get issuer(): string {
    return this.config.get<string>('GSP_AUTH_JWT_ISSUER') ?? 'gsp-server';
  }

  private get apiKeys(): string[] {
    const raw = this.config.get<string>('GSP_AUTH_API_KEYS');
    if (!raw) {
      return [];
    }
    return raw
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
  }

  private signToken(payload: TokenPayload): string {
    const header = this.toBase64Url({ alg: 'HS256', typ: 'JWT' });
    const body = this.toBase64Url(payload);
    const signature = createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64url');

    return `${header}.${body}.${signature}`;
  }

  private parseAndVerifyToken(token: string): TokenPayload {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error('Malformed token');
    }

    const header = this.parseBase64Url<{ alg?: string; typ?: string }>(encodedHeader);
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new Error('Unsupported token header');
    }

    const expectedSignature = createHmac('sha256', this.secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (!this.constantTimeEquals(encodedSignature, expectedSignature)) {
      throw new Error('Bad signature');
    }

    return this.parseBase64Url<TokenPayload>(encodedPayload);
  }

  private toBase64Url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private parseBase64Url<T>(value: string): T {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    if (left.length !== right.length) {
      return false;
    }

    return timingSafeEqual(left, right);
  }
}
