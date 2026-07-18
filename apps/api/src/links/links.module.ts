import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CLOCK, SystemClock } from '../common/clock';
import { IdempotencyService } from '../common/idempotency.service';
import { LinksApiController } from './links-api.controller';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

/** PaymentLink CRUD (dashboard + /v1 surfaces), slug generation, status logic. */
@Module({
  imports: [AuthModule],
  controllers: [LinksController, LinksApiController],
  providers: [
    LinksService,
    IdempotencyService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [LinksService],
})
export class LinksModule {}
