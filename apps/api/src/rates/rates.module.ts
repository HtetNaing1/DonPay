import { Module } from '@nestjs/common';
import { CLOCK, SystemClock } from '../common/clock';
import { CoinGeckoRateSource } from './coingecko.rate-source';
import { QuoteService } from './quote.service';
import { RATE_SOURCE } from './rate-source';

/**
 * RateSource implementations (CoinGecko) + QuoteService (10-min rate lock).
 * Consumers depend on the RATE_SOURCE token, never on CoinGecko directly —
 * the concretion is bound here and nowhere else (CLAUDE.md "D").
 */
@Module({
  providers: [
    CoinGeckoRateSource,
    { provide: RATE_SOURCE, useExisting: CoinGeckoRateSource },
    QuoteService,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [QuoteService, RATE_SOURCE],
})
export class RatesModule {}
