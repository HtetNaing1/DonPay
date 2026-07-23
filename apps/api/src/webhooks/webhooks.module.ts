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
// A NestJS module is a unit of dependency injection. It declares what this
// slice of the app provides and what it borrows from elsewhere. Nest reads
// these arrays at boot to build the dependency graph and instantiate everything
// in the right order — you never `new` a service yourself.
@Module({
  // `imports` pulls in other modules to use *their* exported providers here.
  // We import AuthModule because the controller's SessionGuard needs it.
  imports: [AuthModule],
  // `controllers` are the HTTP entry points Nest will route requests to.
  controllers: [WebhooksController],
  // `providers` are the injectable classes this module owns. Nest creates one
  // shared instance (a singleton) of each and hands it to whoever asks for it
  // in their constructor.
  providers: [
    WebhookOutboxService,
    WebhookDispatcherService,
    WebhookEndpointsService,
    // Binding an interface token to a concrete class (rule D — depend on
    // abstractions). Code asks for CLOCK; Nest injects SystemClock. Tests can
    // bind a fake clock to the same token, so time becomes controllable.
    { provide: CLOCK, useClass: SystemClock },
  ],
  // `exports` makes these providers available to modules that import this one.
  // IntentsModule imports WebhooksModule so transition() can call the outbox.
  exports: [WebhookOutboxService, WebhookDispatcherService],
})
export class WebhooksModule {}
