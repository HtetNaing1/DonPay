import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FIAT_CURRENCIES,
  FiatCurrency,
  PAY_TOKENS,
  PayToken,
} from '@donpay/shared';
import { Clock, CLOCK } from '../common/clock';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Env } from '../config/env';
import { RateSource, TokenRate } from './rate-source';

const COINGECKO_IDS: Record<PayToken, string> = {
  SOL: 'solana',
  USDC: 'usd-coin',
};

/** All supported pairs, fetched in one upstream call. */
type PriceTable = Record<PayToken, Record<FiatCurrency, string>>;

interface CacheEntry {
  table: PriceTable;
  fetchedAt: Date;
}

/**
 * CoinGecko /simple/price with an in-memory cache. One call covers every
 * token×fiat pair, so the cache TTL (not per-pair traffic) sets the upstream
 * request rate. When CoinGecko is down, a stale table still serves for up to
 * the quote-lock window — a rate that old could legitimately be locked into
 * a live quote anyway; beyond that we fail rather than misprice.
 */
@Injectable()
export class CoinGeckoRateSource implements RateSource {
  readonly name = 'coingecko';

  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getRate(token: PayToken, fiat: FiatCurrency): Promise<TokenRate> {
    const { table, fetchedAt } = await this.getTable();
    return { rate: table[token][fiat], asOf: fetchedAt };
  }

  private async getTable(): Promise<CacheEntry> {
    const ttlMs =
      this.config.get('RATE_CACHE_TTL_SECONDS', { infer: true }) * 1000;
    if (this.cache && this.ageMs(this.cache) < ttlMs) {
      return this.cache;
    }

    // Concurrent callers share one upstream request instead of stampeding.
    this.inflight ??= this.fetchTable().finally(() => {
      this.inflight = null;
    });
    try {
      this.cache = await this.inflight;
      return this.cache;
    } catch (error) {
      const staleMs =
        this.config.get('QUOTE_LOCK_SECONDS', { infer: true }) * 1000;
      if (this.cache && this.ageMs(this.cache) < staleMs) {
        return this.cache;
      }
      if (error instanceof ProblemException) throw error;
      throw this.unavailable();
    }
  }

  private async fetchTable(): Promise<CacheEntry> {
    const base = this.config.get('COINGECKO_URL', { infer: true });
    const apiKey = this.config.get('COINGECKO_API_KEY', { infer: true });
    const query = new URLSearchParams({
      ids: PAY_TOKENS.map((token) => COINGECKO_IDS[token]).join(','),
      vs_currencies: FIAT_CURRENCIES.join(',').toLowerCase(),
      precision: 'full',
    });

    const response = await fetch(`${base}/simple/price?${query}`, {
      headers: apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined,
    });
    if (!response.ok) {
      throw this.unavailable();
    }
    const body = (await response.json()) as Record<
      string,
      Record<string, unknown>
    >;

    const table = {} as PriceTable;
    for (const token of PAY_TOKENS) {
      table[token] = {} as PriceTable[PayToken];
      for (const fiat of FIAT_CURRENCIES) {
        const value = body[COINGECKO_IDS[token]]?.[fiat.toLowerCase()];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          throw this.unavailable();
        }
        table[token][fiat] = toDecimalString(value);
      }
    }
    return { table, fetchedAt: this.clock.now() };
  }

  private ageMs(entry: CacheEntry): number {
    return this.clock.now().getTime() - entry.fetchedAt.getTime();
  }

  private unavailable(): ProblemException {
    return new ProblemException(
      503,
      ERROR_CODES.RATE_UNAVAILABLE,
      'Exchange rate is temporarily unavailable — try again shortly',
    );
  }
}

/**
 * JSON boundary: rates arrive as JSON numbers; money math takes decimal
 * strings (CLAUDE.md rule 7 — floats never enter the arithmetic). Normalizes
 * the exponent form JS uses below 1e-6, far outside our pairs' magnitudes.
 */
function toDecimalString(value: number): string {
  const text = String(value);
  if (!text.includes('e')) return text;
  return value.toFixed(18).replace(/0+$/, '').replace(/\.$/, '');
}
