import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  MerchantWallet,
  WalletVerifyInput,
  walletVerifySchema,
} from '@donpay/shared';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { WalletsService } from './wallets.service';

@Controller('merchants/me')
@UseGuards(SessionGuard)
export class MerchantsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('wallets')
  listWallets(@CurrentMerchant() merchant: Merchant): Promise<MerchantWallet[]> {
    return this.walletsService.list(merchant.id);
  }

  /** Attach a payout wallet by proving key ownership: signed nonce message (purpose WALLET_VERIFY). */
  @Post('wallets/verify')
  @HttpCode(201)
  verifyWallet(
    @CurrentMerchant() merchant: Merchant,
    @Body(new ZodValidationPipe(walletVerifySchema)) body: WalletVerifyInput,
  ): Promise<MerchantWallet> {
    return this.walletsService.verify(merchant.id, body);
  }

  @Patch('wallets/:id/default')
  setDefaultWallet(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') walletId: string,
  ): Promise<MerchantWallet> {
    return this.walletsService.setDefault(merchant.id, walletId);
  }
}
