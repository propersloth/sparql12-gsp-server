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

  async hasRole(identity: Identity, _role?: string): Promise<boolean> {
    if (!identity) {
      return false;
    }

    if (!_role) {
      return true;
    }

    return identity.roles.includes(_role);
  }

  private get secret(): string {
    return this.config.get<string>('auth.jwt.secret') ?? '';
  }

  private get issuer(): string {
    return this.config.get<string>('auth.jwt.issuer') ?? 'gsp-server';
  }

  private get apiKeys(): string[] {
    return this.config.get<string[]>('auth.apiKeys') ?? [];
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
