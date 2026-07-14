import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { convertFiatToToken, FiatCurrency, PayToken } from '@donpay/shared';
import { Clock, CLOCK } from '../common/clock';
import { Env } from '../config/env';
import { RATE_SOURCE, RateSource } from './rate-source';

export interface QuoteRequest {
  fiatCurrency: FiatCurrency;
  /** Fiat amount in minor units (cents / JPY as-is). */
  amountFiatMinor: number;
  token: PayToken;
}

/**
 * A locked conversion, ready to embed into a PaymentIntent at creation
 * (CLAUDE.md rule 6 — rates lock at intent creation, never link creation).
 */
export interface Quote {
  fiatCurrency: FiatCurrency;
  amountFiatMinor: number;
  token: PayToken;
  /** Token amount in minor units, rounded up — never fewer than quoted fiat. */
  amountTokenMinor: bigint;
  /** Price of 1 whole token in fiat major units at lock time. */
  rate: string;
  rateSource: string;
  lockedAt: Date;
  /** Expired quotes require a new intent — they are never re-priced in place. */
  lockedUntil: Date;
}

/** One reason to change: turning a fiat amount into a rate-locked token quote. */
@Injectable()
export class QuoteService {
  constructor(
    @Inject(RATE_SOURCE) private readonly rateSource: RateSource,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createQuote(request: QuoteRequest): Promise<Quote> {
    const { rate } = await this.rateSource.getRate(
      request.token,
      request.fiatCurrency,
    );
    const amountTokenMinor = convertFiatToToken({
      amountFiatMinor: request.amountFiatMinor,
      fiatCurrency: request.fiatCurrency,
      token: request.token,
      rate,
    });

    const lockedAt = this.clock.now();
    const lockSeconds = this.config.get('QUOTE_LOCK_SECONDS', { infer: true });
    return {
      ...request,
      amountTokenMinor,
      rate,
      rateSource: this.rateSource.name,
      lockedAt,
      lockedUntil: new Date(lockedAt.getTime() + lockSeconds * 1000),
    };
  }

  /** Single definition of expiry, so intent creation and checkout agree. */
  isExpired(quote: Pick<Quote, 'lockedUntil'>): boolean {
    return quote.lockedUntil <= this.clock.now();
  }
}
