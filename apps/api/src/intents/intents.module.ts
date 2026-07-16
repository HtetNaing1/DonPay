import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChainModule } from '../chain/chain.module';
import { CLOCK, SystemClock } from '../common/clock';
import { IdempotencyService } from '../common/idempotency.service';
import { RatesModule } from '../rates/rates.module';
import { CheckoutController } from './checkout.controller';
import { IntentsController } from './intents.controller';
import { PaymentIntentService } from './payment-intent.service';

/**
 * PaymentIntent lifecycle. All status writes go through
 * PaymentIntentService.transition() — the state machine is the only writer.
 */
@Module({
  imports: [AuthModule, ChainModule, RatesModule],
  controllers: [IntentsController, CheckoutController],
  providers: [
    PaymentIntentService,
    IdempotencyService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [PaymentIntentService],
})
export class IntentsModule {}
