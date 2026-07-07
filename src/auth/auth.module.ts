import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [AuthService, JwtAuthGuard, ApiKeyGuard, OptionalAuthGuard],
  exports: [AuthService, JwtAuthGuard, ApiKeyGuard, OptionalAuthGuard],
})
export class AuthModule {}
