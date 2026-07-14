import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CLOCK, SystemClock } from '../common/clock';
import { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NonceService } from './nonce.service';
import { SessionGuard } from './session.guard';

/**
 * Signup/login (argon2) + dashboard session guard + nonce infrastructure.
 * Wallet verify/login and API keys land here in later tasks.
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
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [SessionGuard, JwtModule, NonceService],
})
export class AuthModule {}
