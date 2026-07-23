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
  CreatedWebhookEndpoint,
  CreateWebhookEndpointInput,
  createWebhookEndpointSchema,
  UpdateWebhookEndpointInput,
  updateWebhookEndpointSchema,
  WebhookDeliveryView,
  WebhookEndpointView,
} from '@donpay/shared';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import { WebhookEndpointsService } from './webhook-endpoints.service';

/** Dashboard surface (session auth) for webhook endpoints + delivery log. */
// @Controller sets the URL prefix: every route below hangs off
// `/merchants/me/webhooks`. A controller's only job is HTTP plumbing —
// parse the request, call a service, return the result. No business logic here.
@Controller('merchants/me/webhooks')
// @UseGuards runs SessionGuard before every handler in this class. The guard
// checks the dashboard session cookie/JWT and attaches the current merchant to
// the request (or throws 401). This is the "session auth" door — rule 9 keeps
// it separate from the `sk_` API-key door used by /v1 routes.
@UseGuards(SessionGuard)
export class WebhooksController {
  // Constructor injection: Nest sees the WebhookEndpointsService type and passes
  // in the singleton it created. `private readonly` both stores it as a field
  // and marks it immutable — a TypeScript shorthand for `this.endpoints = ...`.
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  // @Get() with no argument = GET on the controller's base path.
  // @CurrentMerchant() is a custom parameter decorator that pulls the merchant
  // the guard attached to the request — so we never trust a merchantId from the
  // client; it always comes from the authenticated session (rule 4).
  @Get()
  list(@CurrentMerchant() merchant: Merchant): Promise<WebhookEndpointView[]> {
    // Returning the promise lets Nest await it and serialize the result to JSON.
    return this.endpoints.list(merchant.id);
  }

  /** The response carries the signing secret — the only time it is shown. */
  // @HttpCode(201) overrides the POST default (which is also 201 here, but being
  // explicit documents "a resource was created".)
  @Post()
  @HttpCode(201)
  create(
    @CurrentMerchant() merchant: Merchant,
    // @Body extracts the JSON request body. The ZodValidationPipe runs the body
    // through our shared Zod schema BEFORE the handler sees it: invalid input is
    // rejected with a 400 problem+json, and `body` is now a fully-typed,
    // trusted CreateWebhookEndpointInput. Validation lives in one schema shared
    // with the frontend — the API and the form validate identically.
    @Body(new ZodValidationPipe(createWebhookEndpointSchema))
    body: CreateWebhookEndpointInput,
  ): Promise<CreatedWebhookEndpoint> {
    return this.endpoints.create(merchant.id, body);
  }

  // `:id` is a route parameter. @Param('id') reads it from the URL path,
  // e.g. PATCH /merchants/me/webhooks/abc123 → endpointId = "abc123".
  @Patch(':id')
  update(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') endpointId: string,
    @Body(new ZodValidationPipe(updateWebhookEndpointSchema))
    body: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointView> {
    // merchant.id is passed alongside the id so the service can scope the query
    // — merchant A can never PATCH merchant B's endpoint even by guessing its id.
    return this.endpoints.update(merchant.id, endpointId, body);
  }

  // 204 No Content is the conventional success code for a DELETE that returns
  // no body. The service returns void; Nest sends an empty 204.
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') endpointId: string,
  ): Promise<void> {
    return this.endpoints.remove(merchant.id, endpointId);
  }

  // Nested path: GET /merchants/me/webhooks/:id/deliveries → the delivery log
  // for one endpoint. This is the read side the dashboard's log table calls.
  @Get(':id/deliveries')
  deliveries(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') endpointId: string,
  ): Promise<WebhookDeliveryView[]> {
    return this.endpoints.deliveries(merchant.id, endpointId);
  }

  /** One fresh attempt on the next dispatcher sweep. */
  // Redeliver is addressed by deliveryId (not endpointId): the dashboard has the
  // delivery row in hand. It doesn't send anything itself — it just flips the
  // row back to "due", and the background dispatcher picks it up next sweep.
  @Post('deliveries/:deliveryId/redeliver')
  @HttpCode(200)
  redeliver(
    @CurrentMerchant() merchant: Merchant,
    @Param('deliveryId') deliveryId: string,
  ): Promise<WebhookDeliveryView> {
    return this.endpoints.redeliver(merchant.id, deliveryId);
  }
}
