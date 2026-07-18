import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ChainWatcherService } from '../chain/chain-watcher.service';
import { ChainModule } from '../chain/chain.module';
import { CLOCK, SystemClock } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { Env } from '../config/env';
import { IntentsModule } from '../intents/intents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WatchWorker } from './watch.worker';
import { WebhookWorker } from './webhook.worker';

/**
 * Root module of the worker entry point (`src/worker.ts`) — the second
 * process of this codebase (BullMQ consumers, no HTTP). It reuses the same
 * domain modules as the API; only job processing is exclusive to it.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    PrismaModule,
    ChainModule,
    IntentsModule,
    QueuesModule,
    WebhooksModule,
  ],
  providers: [
    ChainWatcherService,
    WatchWorker,
    WebhookWorker,
    { provide: CLOCK, useClass: SystemClock },
  ],
})
export class WorkerModule {}
