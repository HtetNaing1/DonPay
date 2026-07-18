import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CLOCK, SystemClock } from '../common/clock';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { WebhookOutboxService } from './webhook-outbox.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Webhooks, outbox pattern (rule 3): WebhookOutboxService writes delivery
 * rows inside the transition transaction; WebhookDispatcherService (worker
 * process only) sweeps and delivers with HMAC signing, exponential retries,
 * and dead-lettering. Endpoint CRUD joins with its own task.
 */
@Module({
  imports: [AuthModule],
  controllers: [WebhooksController],
  providers: [
    WebhookOutboxService,
    WebhookDispatcherService,
    WebhookEndpointsService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [WebhookOutboxService, WebhookDispatcherService],
})
export class WebhooksModule {}
