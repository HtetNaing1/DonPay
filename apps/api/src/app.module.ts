import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { ChainModule } from './chain/chain.module';
import { ProblemFilter } from './common/problem/problem.filter';
import { ConfigModule } from './config/config.module';
import { Env } from './config/env';
import { HealthController } from './health/health.controller';
import { CheckoutGateway } from './intents/checkout.gateway';
import { IntentsModule } from './intents/intents.module';
import { LinksModule } from './links/links.module';
import { MerchantsModule } from './merchants/merchants.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './queues/queues.module';
import { RatesModule } from './rates/rates.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // merchantId/intentId correlation fields are bound per request in
          // services via PinoLogger.assign()
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    MerchantsModule,
    LinksModule,
    IntentsModule,
    ChainModule,
    WebhooksModule,
    RatesModule,
    QueuesModule, // CheckoutGateway subscribes to intent events
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    // API process only — the worker publishes intent events, never serves sockets
    CheckoutGateway,
  ],
})
export class AppModule {}
