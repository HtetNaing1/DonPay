import { Logger } from '@nestjs/common';
import {
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { IntentEventsService } from '../queues/intent-events.service';
import { PaymentIntentService } from './payment-intent.service';

/**
 * Live checkout updates: a page emits `watch { intentId }`, joins that
 * intent's room, and receives `intent` events (the full CheckoutIntent —
 * same shape as the GET) whenever the state machine publishes a transition
 * via Redis. Registered in AppModule only — the worker publishes, the API
 * serves sockets. Public like the checkout GET: joining a room requires
 * knowing the unguessable intent id, and pushes carry nothing beyond what
 * that GET already returns.
 */
@WebSocketGateway({ namespace: 'checkout', cors: { origin: true } })
export class CheckoutGateway implements OnGatewayInit {
  @WebSocketServer()
  private readonly server!: Server;
  private readonly logger = new Logger(CheckoutGateway.name);

  constructor(
    private readonly intentEvents: IntentEventsService,
    private readonly intentService: PaymentIntentService,
  ) {}

  afterInit(): void {
    this.intentEvents.subscribe((event) => {
      void this.push(event.intentId);
    });
  }

  @SubscribeMessage('watch')
  async watch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { intentId?: string },
  ): Promise<void> {
    if (typeof body?.intentId !== 'string' || body.intentId.length > 64) return;
    await socket.join(room(body.intentId));
    // catch-up snapshot: a transition may have landed while the page loaded
    try {
      socket.emit('intent', await this.intentService.getPublicCheckout(body.intentId));
    } catch {
      // unknown id — nothing to send; the page shows its 404 already
    }
  }

  private async push(intentId: string): Promise<void> {
    try {
      const sockets = await this.server.in(room(intentId)).fetchSockets();
      if (sockets.length === 0) return; // nobody watching this intent
      this.server
        .in(room(intentId))
        .emit('intent', await this.intentService.getPublicCheckout(intentId));
    } catch (error) {
      this.logger.warn(`push failed for intent ${intentId}: ${String(error)}`);
    }
  }
}

function room(intentId: string): string {
  return `intent:${intentId}`;
}
