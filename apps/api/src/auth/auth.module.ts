import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

/**
 * Signup/login (argon2) + dashboard session guard. Nonce infrastructure,
 * wallet verify/login, and API keys land here in later tasks.
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
  providers: [AuthService, SessionGuard],
  exports: [SessionGuard, JwtModule],
})
export class AuthModule {}
