import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Env } from '../config/env';
import { WatchJobData } from './watch-job';

export const WATCH_QUEUE = Symbol('WATCH_QUEUE');

/**
 * Enqueue side of the watcher — the only thing API-process code touches.
 * The processing side (ChainWatcherService) runs in the worker entry point;
 * the queue is the seam between them, so neither process imports the other.
 */
@Injectable()
export class WatchQueueService {
  private readonly pollMs: number;

  constructor(
    @Inject(WATCH_QUEUE) private readonly queue: Queue<WatchJobData>,
    config: ConfigService<Env, true>,
  ) {
    this.pollMs = config.get('WATCH_POLL_MS', { infer: true });
  }

  /** Start watching a fresh intent; the first tick applies WATCH_STARTED. */
  async startWatch(intentId: string): Promise<void> {
    await this.schedule({ intentId, mode: 'active', errorCount: 0 }, this.pollMs);
  }

  /** (Re)schedule the next tick as a delayed, Redis-persisted job. */
  async schedule(data: WatchJobData, delayMs: number): Promise<void> {
    await this.queue.add('tick', data, {
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}
