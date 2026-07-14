import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Env } from '../config/env';
import { QuoteService } from './quote.service';
import { RateSource } from './rate-source';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function makeService(rate = '160') {
  const rateSource: RateSource = {
    name: 'fake-source',
    getRate: vi.fn().mockResolvedValue({ rate, asOf: NOW }),
  };
  const config = {
    get: vi.fn(() => 600),
  } as unknown as ConfigService<Env, true>;
  const clock: Clock = { now: () => NOW };
  const service = new QuoteService(rateSource, config, clock);
  return { service, rateSource };
}

describe('QuoteService.createQuote', () => {
  it('locks the rate for 10 minutes from now and stamps the source', async () => {
    const { service, rateSource } = makeService();

    const quote = await service.createQuote({
      fiatCurrency: 'USD',
      amountFiatMinor: 2500, // $25.00
      token: 'SOL',
    });

    expect(rateSource.getRate).toHaveBeenCalledWith('SOL', 'USD');
    expect(quote.rate).toBe('160');
    expect(quote.rateSource).toBe('fake-source');
    expect(quote.lockedAt).toEqual(NOW);
    expect(quote.lockedUntil).toEqual(new Date(NOW.getTime() + 600_000));
    // $25 at $160/SOL = 0.15625 SOL, in integer lamports
    expect(quote.amountTokenMinor).toBe(156_250_000n);
  });

  it('rounds the token amount up so exact payment never underpays', async () => {
    const { service } = makeService('3');
    const quote = await service.createQuote({
      fiatCurrency: 'USD',
      amountFiatMinor: 1, // 1¢ at $3/SOL = 0.00333… SOL
      token: 'SOL',
    });
    expect(quote.amountTokenMinor).toBe(3_333_334n); // ceil, not truncate
  });

  it('handles zero-decimal fiat (JPY) in minor units as-is', async () => {
    const { service } = makeService('24000');
    const quote = await service.createQuote({
      fiatCurrency: 'JPY',
      amountFiatMinor: 1000, // ¥1000 at ¥24000/SOL
      token: 'SOL',
    });
    expect(quote.amountTokenMinor).toBe(41_666_667n);
  });

  it('propagates rate-source unavailability untouched', async () => {
    const { service, rateSource } = makeService();
    vi.mocked(rateSource.getRate).mockRejectedValue(
      new ProblemException(503, ERROR_CODES.RATE_UNAVAILABLE, 'down'),
    );
    await expect(
      service.createQuote({
        fiatCurrency: 'USD',
        amountFiatMinor: 100,
        token: 'USDC',
      }),
    ).rejects.toMatchObject({ status: 503, code: 'rate_unavailable' });
  });
});

describe('QuoteService.isExpired', () => {
  it('is expired exactly at lockedUntil, not before', () => {
    const { service } = makeService();
    expect(
      service.isExpired({ lockedUntil: new Date(NOW.getTime() + 1) }),
    ).toBe(false);
    expect(service.isExpired({ lockedUntil: NOW })).toBe(true);
    expect(
      service.isExpired({ lockedUntil: new Date(NOW.getTime() - 1) }),
    ).toBe(true);
  });
});
