import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiKeySummary,
  CreateApiKeyInput,
  createApiKeySchema,
  CreatedApiKey,
  MerchantWallet,
  WalletVerifyInput,
  walletVerifySchema,
} from '@donpay/shared';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { ApiKeysService } from './api-keys.service';
import { WalletsService } from './wallets.service';

@Controller('merchants/me')
@UseGuards(SessionGuard)
export class MerchantsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

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

  @Get('api-keys')
  listApiKeys(@CurrentMerchant() merchant: Merchant): Promise<ApiKeySummary[]> {
    return this.apiKeysService.list(merchant.id);
  }

  /** Response includes the full key — the only time it is ever returned. */
  @Post('api-keys')
  @HttpCode(201)
  createApiKey(
    @CurrentMerchant() merchant: Merchant,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ): Promise<CreatedApiKey> {
    return this.apiKeysService.create(merchant.id, body);
  }

  /** Soft revoke: the key stops authenticating but stays listed. */
  @Delete('api-keys/:id')
  revokeApiKey(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') keyId: string,
  ): Promise<ApiKeySummary> {
    return this.apiKeysService.revoke(merchant.id, keyId);
  }
}
