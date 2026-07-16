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
  CreatePaymentLinkInput,
  createPaymentLinkSchema,
  PaymentLinkView,
  UpdatePaymentLinkInput,
  updatePaymentLinkSchema,
} from '@donpay/shared';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { LinksService } from './links.service';

/**
 * Dashboard surface (session auth). The API-key surface (`/v1/payment-links`)
 * is a separate TASKS.md item — same LinksService underneath, plus the
 * IdempotencyService the intents task introduced (rule 5).
 */
@Controller('merchants/me/links')
@UseGuards(SessionGuard)
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Get()
  list(@CurrentMerchant() merchant: Merchant): Promise<PaymentLinkView[]> {
    return this.linksService.list(merchant.id);
  }

  @Get(':id')
  get(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') linkId: string,
  ): Promise<PaymentLinkView> {
    return this.linksService.get(merchant.id, linkId);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentMerchant() merchant: Merchant,
    @Body(new ZodValidationPipe(createPaymentLinkSchema))
    body: CreatePaymentLinkInput,
  ): Promise<PaymentLinkView> {
    return this.linksService.create(merchant.id, body);
  }

  @Patch(':id')
  update(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') linkId: string,
    @Body(new ZodValidationPipe(updatePaymentLinkSchema))
    body: UpdatePaymentLinkInput,
  ): Promise<PaymentLinkView> {
    return this.linksService.update(merchant.id, linkId, body);
  }

  /** Only unused links can be deleted; with intents this 409s (pause instead). */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') linkId: string,
  ): Promise<void> {
    return this.linksService.remove(merchant.id, linkId);
  }
}
