import { describe, expect, it } from 'vitest';
import {
  classifyPaymentAmount,
  convertFiatToToken,
  fiatMajorToMinor,
  fiatMinorToMajor,
  majorToMinor,
  MAX_FIAT_MINOR,
  minorToMajor,
  tokenMajorToMinor,
  tokenMinorToMajor,
} from './money';

describe('majorToMinor', () => {
  it('parses whole amounts', () => {
    expect(majorToMinor('42', 2)).toBe(4200n);
    expect(majorToMinor('0', 9)).toBe(0n);
  });

  it('parses fractional amounts, padding to the full exponent', () => {
    expect(majorToMinor('1.5', 9)).toBe(1_500_000_000n);
    expect(majorToMinor('0.000001', 6)).toBe(1n);
    expect(majorToMinor('19.99', 2)).toBe(1999n);
  });

  it('handles zero-decimal currencies', () => {
    expect(majorToMinor('5000', 0)).toBe(5000n);
  });

  it('rejects excess precision instead of silently truncating', () => {
    expect(() => majorToMinor('1.999', 2)).toThrow(/decimal places/);
    expect(() => majorToMinor('1.5', 0)).toThrow(/decimal places/);
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '.', '1.', '.5', '-1', '1e5', '1,000', 'abc', 'NaN', 'Infinity']) {
      expect(() => majorToMinor(bad, 2), bad).toThrow();
    }
  });

  it('handles amounts beyond float precision exactly', () => {
    expect(majorToMinor('9007199254740993', 2)).toBe(900719925474099300n);
  });
});

describe('minorToMajor', () => {
  it('formats and trims trailing zeros', () => {
    expect(minorToMajor(1_500_000_000n, 9)).toBe('1.5');
    expect(minorToMajor(4200n, 2)).toBe('42');
    expect(minorToMajor(1n, 6)).toBe('0.000001');
    expect(minorToMajor(0n, 9)).toBe('0');
    expect(minorToMajor(5000n, 0)).toBe('5000');
  });

  it('rejects negative amounts', () => {
    expect(() => minorToMajor(-1n, 2)).toThrow(/non-negative/);
  });

  it('round-trips with majorToMinor', () => {
    for (const [amount, decimals] of [
      ['123.456789', 9],
      ['0.01', 2],
      ['777', 0],
    ] as const) {
      expect(minorToMajor(majorToMinor(amount, decimals), decimals)).toBe(amount);
    }
  });
});

describe('fiat/token helpers', () => {
  it('converts fiat majors respecting the currency exponent', () => {
    expect(fiatMajorToMinor('19.99', 'USD')).toBe(1999);
    expect(fiatMajorToMinor('5000', 'JPY')).toBe(5000);
    expect(() => fiatMajorToMinor('10.5', 'JPY')).toThrow();
  });

  it('rejects fiat amounts that overflow int4 storage', () => {
    expect(fiatMajorToMinor('21474836.47', 'USD')).toBe(MAX_FIAT_MINOR);
    expect(() => fiatMajorToMinor('21474836.48', 'USD')).toThrow(/maximum/);
  });

  it('formats fiat minors', () => {
    expect(fiatMinorToMajor(1999, 'USD')).toBe('19.99');
    expect(fiatMinorToMajor(5000n, 'JPY')).toBe('5000');
  });

  it('converts token amounts (SOL lamports, USDC micro-units)', () => {
    expect(tokenMajorToMinor('1.5', 'SOL')).toBe(1_500_000_000n);
    expect(tokenMajorToMinor('10.25', 'USDC')).toBe(10_250_000n);
    expect(tokenMinorToMajor(1_500_000_000n, 'SOL')).toBe('1.5');
  });
});

describe('convertFiatToToken', () => {
  it('converts USD to SOL lamports at a locked rate', () => {
    // $50.00 at $200.00/SOL = exactly 0.25 SOL
    expect(
      convertFiatToToken({
        amountFiatMinor: 5000,
        fiatCurrency: 'USD',
        token: 'SOL',
        rate: '200.00',
      }),
    ).toBe(250_000_000n);
  });

  it('rounds up so the merchant is never short', () => {
    // $50.00 / $158.00 = 0.3164556962... SOL → 316455696.2 lamports → ceil
    expect(
      convertFiatToToken({
        amountFiatMinor: 5000,
        fiatCurrency: 'USD',
        token: 'SOL',
        rate: '158.00',
      }),
    ).toBe(316_455_697n);
  });

  it('handles zero-decimal fiat (JPY → USDC)', () => {
    // ¥10000 / ¥155.5 = 64.30868... USDC → 64308681.6 micro → ceil
    expect(
      convertFiatToToken({
        amountFiatMinor: 10_000,
        fiatCurrency: 'JPY',
        token: 'USDC',
        rate: '155.5',
      }),
    ).toBe(64_308_682n);
  });

  it('accepts whole-number rates and bigint fiat amounts', () => {
    expect(
      convertFiatToToken({
        amountFiatMinor: 100n,
        fiatCurrency: 'USD',
        token: 'USDC',
        rate: '1',
      }),
    ).toBe(1_000_000n);
  });

  it('rejects zero, negative, and malformed rates', () => {
    const base = { amountFiatMinor: 100, fiatCurrency: 'USD', token: 'SOL' } as const;
    expect(() => convertFiatToToken({ ...base, rate: '0' })).toThrow(/positive/);
    expect(() => convertFiatToToken({ ...base, rate: '0.00' })).toThrow(/positive/);
    expect(() => convertFiatToToken({ ...base, rate: '-5' })).toThrow(/Invalid rate/);
    expect(() => convertFiatToToken({ ...base, rate: '1e2' })).toThrow(/Invalid rate/);
  });

  it('rejects non-integer fiat amounts', () => {
    expect(() =>
      convertFiatToToken({
        amountFiatMinor: 10.5,
        fiatCurrency: 'USD',
        token: 'SOL',
        rate: '100',
      }),
    ).toThrow(/integer/);
  });
});

describe('classifyPaymentAmount', () => {
  it('classifies exact, under, and over payments', () => {
    expect(classifyPaymentAmount(100n, 100n)).toBe('EXACT');
    expect(classifyPaymentAmount(100n, 99n)).toBe('UNDERPAID');
    expect(classifyPaymentAmount(100n, 101n)).toBe('OVERPAID');
  });
});
