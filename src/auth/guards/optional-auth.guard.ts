import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { RequestLike } from '../auth.types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();

    if (SAFE_METHODS.has((request.method ?? 'GET').toUpperCase())) {
      return true;
    }

    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      try {
        request.identity = await this.authService.verifyToken(
          authorization.slice('Bearer '.length).trim(),
        );
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      const result = await this.authService.validateApiKey(apiKey);
      if (result.valid) {
        request.identity = result.identity;
        return true;
      }
      throw new UnauthorizedException('Invalid API key');
    }

    throw new UnauthorizedException('Authentication required for mutations');
  }
}
