import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  CheckoutIntent,
  OpenLinkIntentInput,
  openLinkIntentSchema,
  PaymentIntentView,
  PublicLink,
} from '@donpay/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LinksService } from '../links/links.service';
import { PaymentIntentService } from './payment-intent.service';

/**
 * Public checkout surface — deliberately unauthenticated: customers open
 * payment links. Tenant scoping comes from the slug lookup itself; the
 * response exposes only what the checkout page needs to render.
 */
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly intentService: PaymentIntentService,
    private readonly linksService: LinksService,
  ) {}

  /** What `/pay/[slug]` renders before any intent exists — the link's payable terms. */
  @Get('links/:slug')
  link(@Param('slug') slug: string): Promise<PublicLink> {
    return this.linksService.getPublicBySlug(slug);
  }

  /** Link-open flow: `/pay/[slug]` posts here, then redirects to the checkout URL. */
  @Post('links/:slug/intents')
  @HttpCode(201)
  open(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(openLinkIntentSchema))
    body: OpenLinkIntentInput,
  ): Promise<PaymentIntentView> {
    return this.intentService.openLink(slug, body);
  }

  /** Everything `/checkout/[intentId]` server-renders; the WS gateway pushes the same shape. */
  @Get('intents/:id')
  checkout(@Param('id') intentId: string): Promise<CheckoutIntent> {
    return this.intentService.getPublicCheckout(intentId);
  }
}
