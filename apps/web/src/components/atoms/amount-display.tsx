import { FiatCurrency, fiatMinorToMajor } from '@donpay/shared';

interface AmountDisplayProps {
  /** Fiat amount in minor units (cents / JPY as-is). */
  minor: number;
  currency: FiatCurrency;
  className?: string;
}

/** Formats a minor-unit fiat amount ("2500" USD → "25.00 USD"). */
export function AmountDisplay({ minor, currency, className }: AmountDisplayProps) {
  return (
    <span className={className}>
      {fiatMinorToMajor(minor, currency)}&nbsp;{currency}
    </span>
  );
}
