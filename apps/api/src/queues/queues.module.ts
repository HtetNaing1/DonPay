import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Env } from '../config/env';
import { IntentEventsService } from './intent-events.service';
import { WATCH_QUEUE_NAME, WatchJobData } from './watch-job';
import { WATCH_QUEUE, WatchQueueService } from './watch-queue.service';

/**
 * BullMQ connection factory — one place that knows REDIS_URL. BullMQ needs
 * `maxRetriesPerRequest: null` (workers hold blocking connections).
 */
export function createRedisConnection(
  config: ConfigService<Env, true>,
): IORedis {
  return new IORedis(config.get('REDIS_URL', { infer: true }), {
    maxRetriesPerRequest: null,
  });
}

@Module({
  providers: [
    {
      provide: WATCH_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Queue<WatchJobData>(WATCH_QUEUE_NAME, {
          connection: createRedisConnection(config),
        }),
    },
    WatchQueueService,
    IntentEventsService,
  ],
  exports: [WatchQueueService, IntentEventsService],
})
export class QueuesModule implements OnApplicationShutdown {
  constructor(
    @Inject(WATCH_QUEUE) private readonly queue: Queue<WatchJobData>,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close(); // also releases the IORedis connection it owns
  }
}
