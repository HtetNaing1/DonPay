import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CLOCK, SystemClock } from '../common/clock';
import { ApiKeysService } from './api-keys.service';
import { MerchantsController } from './merchants.controller';
import { WalletsService } from './wallets.service';

/** Merchant profile, payout wallets (verify/default), API keys. */
@Module({
  imports: [AuthModule],
  controllers: [MerchantsController],
  providers: [
    WalletsService,
    ApiKeysService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [WalletsService, ApiKeysService],
})
export class MerchantsModule {}
