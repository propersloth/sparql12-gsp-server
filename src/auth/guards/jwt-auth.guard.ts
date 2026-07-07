import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { RequestLike } from '../auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authorization.slice('Bearer '.length).trim();

    let identity;
    try {
      identity = await this.authService.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!(await this.authService.hasRole(identity))) {
      throw new ForbiddenException('Insufficient permissions');
    }

    request.identity = identity;
    return true;
  }
}
