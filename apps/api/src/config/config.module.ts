import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env';

/**
 * Global, env-validated config. Inject as `ConfigService<Env, true>` and read
 * with `config.get('KEY', { infer: true })` — validation guarantees presence.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
