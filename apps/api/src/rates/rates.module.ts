import { Module } from '@nestjs/common';

/**
 * RateSource implementations (CoinGecko) + QuoteService (10-min rate lock).
 * Consumers depend on the RATE_SOURCE token, never on CoinGecko directly.
 */
@Module({})
export class RatesModule {}
