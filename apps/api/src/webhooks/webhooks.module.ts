import { Module } from '@nestjs/common';
import { CLOCK, SystemClock } from '../common/clock';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookOutboxService } from './webhook-outbox.service';

/**
 * Webhooks, outbox pattern (rule 3): WebhookOutboxService writes delivery
 * rows inside the transition transaction; WebhookDispatcherService (worker
 * process only) sweeps and delivers with HMAC signing, exponential retries,
 * and dead-lettering. Endpoint CRUD joins with its own task.
 */
@Module({
  providers: [
    WebhookOutboxService,
    WebhookDispatcherService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [WebhookOutboxService, WebhookDispatcherService],
})
export class WebhooksModule {}
