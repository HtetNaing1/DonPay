import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock';
import { Env } from '../config/env';
import { CoinGeckoRateSource } from './coingecko.rate-source';

const T0 = new Date('2026-07-15T12:00:00.000Z');

function makeSource(env: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    COINGECKO_URL: 'https://cg.test/api/v3',
    COINGECKO_API_KEY: undefined,
    RATE_CACHE_TTL_SECONDS: 60,
    QUOTE_LOCK_SECONDS: 600,
    ...env,
  };
  const config = {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService<Env, true>;
  const clock = {
    current: T0,
    now(): Date {
      return this.current;
    },
    advance(ms: number) {
      this.current = new Date(this.current.getTime() + ms);
    },
  } satisfies Clock & { current: Date; advance(ms: number): void };
  const source = new CoinGeckoRateSource(config, clock);
  return { source, clock };
}

function priceBody(solUsd: number = 158.42) {
  return {
    solana: { usd: solUsd, eur: 145.5, jpy: 24513.7 },
    'usd-coin': { usd: 1.0001, eur: 0.92, jpy: 154.8 },
  };
}

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoinGeckoRateSource', () => {
  it('fetches all pairs in one call and returns decimal-string rates', async () => {
    const { source } = makeSource();
    const fetchMock = stubFetch(priceBody());

    const sol = await source.getRate('SOL', 'USD');
    const usdc = await source.getRate('USDC', 'JPY');

    expect(sol).toEqual({ rate: '158.42', asOf: T0 });
    expect(usdc.rate).toBe('154.8');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://cg.test/api/v3/simple/price');
    expect(url.searchParams.get('ids')).toBe('solana,usd-coin');
    expect(url.searchParams.get('vs_currencies')).toBe('usd,eur,jpy');
  });

  it('serves from cache within the TTL and refetches after it', async () => {
    const { source, clock } = makeSource();
    const fetchMock = stubFetch(priceBody());

    await source.getRate('SOL', 'USD');
    clock.advance(59_000);
    await source.getRate('SOL', 'EUR');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock.advance(2_000); // past the 60s TTL
    await source.getRate('SOL', 'USD');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one upstream request across concurrent callers', async () => {
    const { source } = makeSource();
    const fetchMock = stubFetch(priceBody());

    const [a, b] = await Promise.all([
      source.getRate('SOL', 'USD'),
      source.getRate('USDC', 'USD'),
    ]);
    expect(a.rate).toBe('158.42');
    expect(b.rate).toBe('1.0001');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a stale table while the source is down, up to the quote-lock window', async () => {
    const { source, clock } = makeSource();
    stubFetch(priceBody());
    await source.getRate('SOL', 'USD');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    clock.advance(120_000); // TTL over, still inside 600s lock window
    await expect(source.getRate('SOL', 'USD')).resolves.toMatchObject({
      rate: '158.42',
    });

    clock.advance(600_000); // now older than the lock window
    await expect(source.getRate('SOL', 'USD')).rejects.toMatchObject({
      status: 503,
      code: 'rate_unavailable',
    });
  });

  it('maps upstream failure with no cache to rate_unavailable', async () => {
    const { source } = makeSource();
    stubFetch({}, false);
    await expect(source.getRate('SOL', 'USD')).rejects.toMatchObject({
      status: 503,
      code: 'rate_unavailable',
    });
  });

  it('rejects a response missing a pair instead of quoting a hole', async () => {
    const { source } = makeSource();
    stubFetch({ solana: { usd: 158.42 } }); // eur/jpy and usd-coin absent
    await expect(source.getRate('SOL', 'USD')).rejects.toMatchObject({
      code: 'rate_unavailable',
    });
  });

  it('sends the demo API key header only when configured', async () => {
    const { source } = makeSource({ COINGECKO_API_KEY: 'cg-demo-key' });
    const fetchMock = stubFetch(priceBody());
    await source.getRate('SOL', 'USD');
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { 'x-cg-demo-api-key': 'cg-demo-key' },
    });

    const anonymous = makeSource();
    const anonFetch = stubFetch(priceBody());
    await anonymous.source.getRate('SOL', 'USD');
    expect(anonFetch.mock.calls[0][1]).toEqual({ headers: undefined });
  });

  it('normalizes exponent-form numbers into plain decimal strings', async () => {
    const { source } = makeSource();
    stubFetch(priceBody(1e-7));
    const { rate } = await source.getRate('SOL', 'USD');
    expect(rate).toBe('0.0000001');
  });
});
