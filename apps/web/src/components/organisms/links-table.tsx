'use client';

import { useEffect, useState } from 'react';
import type { PaymentLinkView } from '@donpay/shared';
import { Trash2 } from 'lucide-react';
import { deletePaymentLink, setLinkStatus } from '@/app/dashboard/links/actions';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { PaymentLinkRow } from '@/components/molecules/payment-link-row';

/** Merchant's links with pause/resume/delete controls; owns client-side URL building. */
export function LinksTable({
  links,
  emptyState,
}: {
  links: PaymentLinkView[];
  /** Shown in place of rows when the list is empty (owner tailors the copy). */
  emptyState?: React.ReactNode;
}) {
  // window is unavailable during SSR; links copy/QR need the absolute origin
  const [origin, setOrigin] = useState('');
  const [linkToDelete, setLinkToDelete] = useState<PaymentLinkView | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  if (links.length === 0) {
    return (
      <>
        {emptyState ?? (
          <div className="px-6 py-14 text-center">
            <p className="font-mono text-[13px] text-ink-soft">No payment links yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
              Create one to share a hosted checkout — payments land straight in your ledger.
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={linkToDelete !== null}
        onClose={() => setLinkToDelete(null)}
        title="Delete this link?"
        destructive
        confirmLabel="Delete link"
        onConfirm={async () => {
          if (!linkToDelete) return;
          await deletePaymentLink(linkToDelete.id);
          setLinkToDelete(null);
        }}
        message={
          <>
            <span className="font-mono text-ink">{`/pay/${linkToDelete?.slug}`}</span> has never
            been used, so nothing depends on it. Deleting removes the URL and its QR code for good —
            this can’t be undone.
          </>
        }
      />
      <ul className="divide-y divide-hairline">
        {links.map((link) => (
          <li key={link.id}>
            <PaymentLinkRow
              link={link}
              url={`${origin}/pay/${link.slug}`}
              action={
                <span className="flex shrink-0 items-center gap-1.5">
                  {(link.status === 'ACTIVE' || link.status === 'PAUSED') && (
                    <form
                      action={setLinkStatus.bind(
                        null,
                        link.id,
                        link.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                      )}
                    >
                      <button
                        type="submit"
                        className="h-9 w-20 shrink-0 cursor-pointer rounded-md border border-hairline bg-surface text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        {link.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                      </button>
                    </form>
                  )}
                  {link.useCount === 0 && (
                    <button
                      type="button"
                      aria-label="Delete link"
                      title="Delete — only unused links can be deleted"
                      onClick={() => setLinkToDelete(link)}
                      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface text-ink-soft transition-colors duration-200 hover:border-destructive/40 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}
