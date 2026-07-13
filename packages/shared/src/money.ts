/**
 * Money utilities — the single home for amount conversions (CLAUDE.md rule 7).
 *
 * All amounts are integers in minor units: lamports for SOL, micro-units for
 * USDC, cents for USD/EUR, JPY as-is. Decimal values only ever exist as
 * strings at the boundary (user input, rate sources); internally everything
 * is bigint. No floats in money math, ever.
 */

export const FIAT_CURRENCIES = ['USD', 'EUR', 'JPY'] as const;
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];

/** ISO 4217 minor-unit exponents for the currencies we support. */
export const FIAT_DECIMALS: Record<FiatCurrency, number> = {
  USD: 2,
  EUR: 2,
  JPY: 0,
};

export const PAY_TOKENS = ['SOL', 'USDC'] as const;
export type PayToken = (typeof PAY_TOKENS)[number];

export const TOKEN_DECIMALS: Record<PayToken, number> = {
  SOL: 9, // lamports
  USDC: 6, // micro-units
};

/** Postgres int4 upper bound — fiat minor amounts are stored as Prisma Int. */
export const MAX_FIAT_MINOR = 2_147_483_647;

/** Non-negative decimal string: digits, optional fraction. No sign, no exponent. */
const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

export function pow10(exp: number): bigint {
  if (!Number.isInteger(exp) || exp < 0) {
    throw new RangeError(`Exponent must be a non-negative integer, got ${exp}`);
  }
  return 10n ** BigInt(exp);
}

/**
 * Parse a non-negative decimal string into minor units.
 * Rejects anything with more fractional digits than `decimals` — silently
 * dropping precision is how money bugs are born.
 */
export function majorToMinor(amount: string, decimals: number): bigint {
  const match = DECIMAL_RE.exec(amount.trim());
  if (!match) {
    throw new Error(`Invalid decimal amount: "${amount}"`);
  }
  const whole = match[1] as string;
  const frac = match[2] ?? '';
  if (frac.length > decimals) {
    throw new Error(
      `Amount "${amount}" has ${frac.length} decimal places; max is ${decimals}`,
    );
  }
  const fracMinor = frac === '' ? 0n : BigInt(frac.padEnd(decimals, '0'));
  return BigInt(whole) * pow10(decimals) + fracMinor;
}

/** Format minor units as a decimal string, trailing zeros trimmed ("1.5", "42"). */
export function minorToMajor(minor: bigint, decimals: number): string {
  if (minor < 0n) {
    throw new RangeError(`Amount must be non-negative, got ${minor}`);
  }
  const base = pow10(decimals);
  const whole = (minor / base).toString();
  const frac = (minor % base)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

export function fiatMajorToMinor(amount: string, currency: FiatCurrency): number {
  const minor = majorToMinor(amount, FIAT_DECIMALS[currency]);
  if (minor > BigInt(MAX_FIAT_MINOR)) {
    throw new RangeError(`Fiat amount ${amount} ${currency} exceeds the storable maximum`);
  }
  return Number(minor);
}

export function fiatMinorToMajor(minor: number | bigint, currency: FiatCurrency): string {
  return minorToMajor(toBigInt(minor), FIAT_DECIMALS[currency]);
}

export function tokenMajorToMinor(amount: string, token: PayToken): bigint {
  return majorToMinor(amount, TOKEN_DECIMALS[token]);
}

export function tokenMinorToMajor(minor: bigint, token: PayToken): string {
  return minorToMajor(minor, TOKEN_DECIMALS[token]);
}

export interface FiatToTokenParams {
  /** Fiat amount in minor units (cents / JPY as-is). */
  amountFiatMinor: number | bigint;
  fiatCurrency: FiatCurrency;
  token: PayToken;
  /** Price of 1 whole token in fiat major units, as a decimal string (e.g. "158.42"). */
  rate: string;
}

/**
 * Convert a fiat amount to token minor units at a locked rate.
 *
 * Rounds UP to the next minor unit: the buyer may pay a dust fraction more,
 * but the merchant never receives less than the quoted fiat value — and an
 * exact payment can never be misclassified as an underpayment.
 */
export function convertFiatToToken({
  amountFiatMinor,
  fiatCurrency,
  token,
  rate,
}: FiatToTokenParams): bigint {
  const fiatMinor = toBigInt(amountFiatMinor);
  if (fiatMinor < 0n) {
    throw new RangeError(`Fiat amount must be non-negative, got ${fiatMinor}`);
  }
  const match = DECIMAL_RE.exec(rate.trim());
  if (!match) {
    throw new Error(`Invalid rate: "${rate}"`);
  }
  const rateScale = (match[2] ?? '').length;
  const rateDigits = BigInt((match[1] as string) + (match[2] ?? ''));
  if (rateDigits === 0n) {
    throw new Error(`Rate must be positive, got "${rate}"`);
  }
  // tokenMinor = fiatMajor / rate * 10^tokenDecimals, all in integers:
  const numerator =
    fiatMinor * pow10(TOKEN_DECIMALS[token]) * pow10(rateScale);
  const denominator = pow10(FIAT_DECIMALS[fiatCurrency]) * rateDigits;
  return ceilDiv(numerator, denominator);
}

export type PaymentAmountComparison = 'EXACT' | 'UNDERPAID' | 'OVERPAID';

/** Compare a received on-chain amount against the quoted amount (same token, minor units). */
export function classifyPaymentAmount(
  expectedMinor: bigint,
  receivedMinor: bigint,
): PaymentAmountComparison {
  if (receivedMinor < expectedMinor) return 'UNDERPAID';
  if (receivedMinor > expectedMinor) return 'OVERPAID';
  return 'EXACT';
}

function toBigInt(value: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Expected an integer minor-unit amount, got ${value}`);
  }
  return BigInt(value);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
