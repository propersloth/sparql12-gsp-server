import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { RequestLike } from '../auth.types';

/**
 * Mutation-route guard (issue #46): PUT/POST/PATCH/DELETE MUST be
 * authenticated via either a Bearer JWT or an X-API-Key header - there is
 * no read-bypass here (see OptionalAuthGuard for that).
 *
 * Status code split is deliberate, not incidental:
 *   - no credentials presented at all  -> 401 (WWW-Authenticate challenge,
 *     UR-SEC-01 / attached by GspExceptionFilter)
 *   - credentials presented but invalid/expired/unknown -> 403 (UR-SEC-02;
 *     the caller *attempted* to authenticate and failed, which is an
 *     authorization refusal, not "please authenticate")
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.authService.isEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const authorization = request.headers.authorization;
    const apiKey = request.headers['x-api-key'];

    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim();

      let identity;
      try {
        identity = await this.authService.verifyToken(token);
      } catch {
        throw new ForbiddenException('Invalid or expired token');
      }

      if (!(await this.authService.hasRole(identity))) {
        throw new ForbiddenException('Insufficient permissions');
      }

      request.identity = identity;
      return true;
    }

    if (apiKey) {
      const result = await this.authService.validateApiKey(apiKey);
      if (!result.valid) {
        throw new ForbiddenException('Invalid API key');
      }

      request.identity = result.identity;
      return true;
    }

    throw new UnauthorizedException('Authentication required for mutations');
  }
}
