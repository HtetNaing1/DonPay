import { FiatCurrency, PayToken } from '@donpay/shared';

/** A spot price as reported by a rate source. */
export interface TokenRate {
  /** Price of 1 whole token in fiat major units, as a decimal string ("158.42"). */
  rate: string;
  /** When the source fetched it — may lag `now` by up to the cache TTL. */
  asOf: Date;
}

/**
 * Narrow rate-fetching contract (CLAUDE.md "I"). Consumers inject the
 * RATE_SOURCE token, never a concrete implementation (CLAUDE.md "D").
 */
export interface RateSource {
  /** Stable identifier persisted on intents (`PaymentIntent.rateSource`). */
  readonly name: string;
  getRate(token: PayToken, fiat: FiatCurrency): Promise<TokenRate>;
}

export const RATE_SOURCE = Symbol('RATE_SOURCE');
