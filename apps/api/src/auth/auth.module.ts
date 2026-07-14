import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CLOCK, SystemClock } from '../common/clock';
import { Env } from '../config/env';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NonceService } from './nonce.service';
import { SessionGuard } from './session.guard';

/**
 * Signup/login (argon2), nonce infrastructure, and both auth guards:
 * SessionGuard (dashboard JWT) and ApiKeyGuard (`sk_` keys) — separate by
 * design, no route accepts both (CLAUDE.md rule 9).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('AUTH_JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('AUTH_SESSION_TTL_SECONDS', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    NonceService,
    SessionGuard,
    ApiKeyGuard,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [SessionGuard, ApiKeyGuard, JwtModule, NonceService],
})
export class AuthModule {}
