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

  // OnModuleInit is a Nest lifecycle hook — it runs once, after DI is wired and
  // the app is ready. We start the recurring sweep here (not in the constructor)
  // so nothing ticks before the app is fully up.
  onModuleInit(): void {
    const pollMs = this.config.get('WEBHOOK_POLL_MS', { infer: true });
    // setInterval calls sweep() every pollMs. `void` says "I'm intentionally not
    // awaiting this promise" (setInterval can't await anyway) and silences the
    // no-floating-promise lint — sweep() handles its own errors internally.
    this.timer = setInterval(() => void this.sweep(), pollMs);
    this.logger.log(`webhook outbox sweep every ${pollMs}ms`);
  }

  private async sweep(): Promise<void> {
    // Overlap guard: if a previous sweep is still running (slow endpoints,
    // timeouts), skip this tick instead of stacking a second concurrent sweep.
    // `sweeping` is a simple in-process boolean — fine because each worker runs
    // one sweep loop; cross-process safety is the dispatcher's optimistic claim.
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.dispatcher.tick();
    } catch (error) {
      // Swallow-and-log: one bad sweep must not kill the interval. The next
      // tick tries again; failed deliveries are already persisted as rows.
      this.logger.error(`outbox sweep failed: ${String(error)}`);
    } finally {
      // Always clear the flag, even on error, so the loop keeps ticking.
      this.sweeping = false;
    }
  }

  // Paired lifecycle hook: stop the timer on shutdown so the process can exit
  // cleanly (an unstopped interval would keep the event loop alive).
  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
  }
}
