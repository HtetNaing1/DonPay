import type { PaymentLinkView } from '@donpay/shared';
import { AmountDisplay } from '@/components/atoms/amount-display';
import { CopyButton } from '@/components/atoms/copy-button';
import { StatusDot } from '@/components/atoms/status-dot';
import { QrCodeDialogButton } from '@/components/molecules/qr-code-dialog';

const STATUS_TONE = {
  ACTIVE: 'success',
  PAUSED: 'idle',
  COMPLETED: 'idle',
  EXPIRED: 'error',
} as const;

const STATUS_LABEL = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
} as const;

interface PaymentLinkRowProps {
  link: PaymentLinkView;
  /** Absolute checkout URL — computed by the owner (client-side origin). */
  url: string;
  /** Row-level control (pause/resume) rendered by the owner. */
  action?: React.ReactNode;
}

/** One payment link: URL + copy/QR, amount, status, usage. */
export function PaymentLinkRow({ link, url, action }: PaymentLinkRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
      <div className="min-w-0 flex-1 basis-52">
        <p className="flex items-center gap-1 font-mono text-[13px] text-ink">
          <span className="truncate" title={url}>{`/pay/${link.slug}`}</span>
          <CopyButton value={url} label="Copy link URL" className="p-1.5" />
          <QrCodeDialogButton
            value={url}
            fileName={`donpay-link-${link.slug}`}
            subtitle={`/pay/${link.slug}`}
            className="p-1.5"
          />
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-soft">
          {link.note ?? (link.type === 'ONE_TIME' ? 'One-time link' : 'Reusable link')}
        </p>
      </div>

      <div className="w-32 text-sm text-ink tabular-nums">
        {link.amountMode === 'FIXED' && link.amountFiat !== null ? (
          <AmountDisplay minor={link.amountFiat} currency={link.fiatCurrency} />
        ) : (
          <span className="text-ink-soft">
            {link.minFiat !== null && link.maxFiat !== null ? (
              <>
                <AmountDisplay minor={link.minFiat} currency={link.fiatCurrency} />
                –
                <AmountDisplay minor={link.maxFiat} currency={link.fiatCurrency} />
              </>
            ) : (
              'Payer chooses'
            )}
          </span>
        )}
        <p className="mt-0.5 font-mono text-[11px] tracking-wider text-ink-soft/70 uppercase">
          {link.token}
        </p>
      </div>

      <p className="flex w-24 items-center gap-2 text-[13px] text-ink-soft">
        <StatusDot tone={STATUS_TONE[link.status]} pulse={link.status === 'ACTIVE'} />
        {STATUS_LABEL[link.status]}
      </p>

      <p className="w-16 font-mono text-[13px] text-ink-soft tabular-nums">
        {link.useCount}
        {link.maxUses !== null && `/${link.maxUses}`}
      </p>

      {action}
    </div>
  );
}
