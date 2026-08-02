import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [AuthService, JwtAuthGuard, ApiKeyGuard, OptionalAuthGuard, JwtOrApiKeyGuard],
  exports: [AuthService, JwtAuthGuard, ApiKeyGuard, OptionalAuthGuard, JwtOrApiKeyGuard],
})
export class AuthModule {}
