import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CLOCK, SystemClock } from '../common/clock';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

/** PaymentLink CRUD, slug generation, link status logic. */
@Module({
  imports: [AuthModule],
  controllers: [LinksController],
  providers: [LinksService, { provide: CLOCK, useClass: SystemClock }],
  exports: [LinksService],
})
export class LinksModule {}
