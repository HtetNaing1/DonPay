import { Star } from 'lucide-react';

interface WalletBadgeProps {
  address: string;
  verifiedAt: string | null;
  isDefault: boolean;
  /** Row-level control (e.g. a set-default button) rendered by the owner. */
  action?: React.ReactNode;
}

/** One verified payout wallet: truncated address, verification date, default marker. */
export function WalletBadge({ address, verifiedAt, isDefault, action }: WalletBadgeProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-mono text-[13px] text-ink" title={address}>
          <span className="truncate">{`${address.slice(0, 4)}…${address.slice(-4)}`}</span>
          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 px-2 py-0.5 font-sans text-[11px] font-medium text-brand-deep">
              <Star className="size-3" aria-hidden="true" />
              Default payout
            </span>
          )}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {verifiedAt
            ? `Verified ${new Date(verifiedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}`
            : 'Not verified'}
        </p>
      </div>
      {action}
    </div>
  );
}
