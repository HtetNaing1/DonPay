import {
  Injectable,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { Env } from '../config/env';

const CHANNEL = 'donpay:intent-events';

export interface IntentEvent {
  intentId: string;
}

/**
 * Cross-process fan-out for intent transitions: the state machine runs in
 * the worker, the WS connections live in the API — Redis pub/sub bridges
 * them (same seam pattern as the queue). Only the id travels; subscribers
 * rebuild the view themselves, so there is one code path for what clients
 * see. Fire-and-forget by design: a missed push is healed by the checkout
 * page's fallback poll, never by blocking a transition.
 */
@Injectable()
export class IntentEventsService implements OnApplicationShutdown {
  private readonly publisher: IORedis;
  private subscriber?: IORedis;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.publisher = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
  }

  async publish(event: IntentEvent): Promise<void> {
    await this.publisher.publish(CHANNEL, JSON.stringify(event));
  }

  /** Lazily opens the dedicated subscriber connection (pub/sub mode blocks a client). */
  subscribe(handler: (event: IntentEvent) => void): void {
    if (!this.subscriber) {
      this.subscriber = new IORedis(
        this.config.get('REDIS_URL', { infer: true }),
        { maxRetriesPerRequest: null },
      );
      void this.subscriber.subscribe(CHANNEL);
    }
    this.subscriber.on('message', (_channel, message) => {
      try {
        handler(JSON.parse(message) as IntentEvent);
      } catch {
        // malformed message — drop it; the poll fallback covers the gap
      }
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.publisher.quit();
    await this.subscriber?.quit();
  }
}
