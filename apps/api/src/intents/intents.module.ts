import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChainModule } from '../chain/chain.module';
import { CLOCK, SystemClock } from '../common/clock';
import { IdempotencyService } from '../common/idempotency.service';
import { LinksModule } from '../links/links.module';
import { QueuesModule } from '../queues/queues.module';
import { RatesModule } from '../rates/rates.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { CheckoutController } from './checkout.controller';
import { IntentsController } from './intents.controller';
import { MerchantIntentsController } from './merchant-intents.controller';
import { PaymentIntentService } from './payment-intent.service';

/**
 * PaymentIntent lifecycle. All status writes go through
 * PaymentIntentService.transition() — the state machine is the only writer.
 */
@Module({
  imports: [
    AuthModule,
    ChainModule,
    RatesModule,
    QueuesModule,
    LinksModule,
    WebhooksModule,
  ],
  controllers: [IntentsController, MerchantIntentsController, CheckoutController],
  providers: [
    PaymentIntentService,
    IdempotencyService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [PaymentIntentService],
})
export class IntentsModule {}
