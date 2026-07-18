import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { ChainWatcherService } from '../chain/chain-watcher.service';
import { Env } from '../config/env';
import { createRedisConnection } from '../queues/queues.module';
import { WATCH_QUEUE_NAME, WatchJobData } from '../queues/watch-job';

/**
 * Binds the BullMQ Worker to ChainWatcherService.tick. Lives only in
 * WorkerModule — the API process enqueues but never processes.
 */
@Injectable()
export class WatchWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WatchWorker.name);
  private worker?: Worker<WatchJobData>;

  constructor(
    private readonly watcher: ChainWatcherService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<WatchJobData>(
      WATCH_QUEUE_NAME,
      (job) => this.watcher.tick(job.data),
      {
        connection: createRedisConnection(this.config),
        concurrency: 10,
      },
    );
    // tick() catches its own errors; anything landing here is a bug or Redis trouble
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `watch job ${job?.id ?? '?'} failed hard: ${String(error)}`,
      );
    });
    this.logger.log(`watching queue "${WATCH_QUEUE_NAME}"`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
