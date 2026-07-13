import { Module } from '@nestjs/common';

/**
 * PaymentIntent lifecycle. All status writes go through
 * PaymentIntentService.transition() — the state machine is the only writer.
 */
@Module({})
export class IntentsModule {}
