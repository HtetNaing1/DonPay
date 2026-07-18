import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';

/**
 * Runs the outbox sweep on an interval in the worker process. Stateless by
 * design — the WebhookDelivery table is the queue, so restarts lose nothing.
 * The overlap guard keeps a slow sweep (timeouts) from stacking on itself.
 */
@Injectable()
export class WebhookWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WebhookWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly dispatcher: WebhookDispatcherService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const pollMs = this.config.get('WEBHOOK_POLL_MS', { infer: true });
    this.timer = setInterval(() => void this.sweep(), pollMs);
    this.logger.log(`webhook outbox sweep every ${pollMs}ms`);
  }

  private async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.dispatcher.tick();
    } catch (error) {
      this.logger.error(`outbox sweep failed: ${String(error)}`);
    } finally {
      this.sweeping = false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
  }
}
