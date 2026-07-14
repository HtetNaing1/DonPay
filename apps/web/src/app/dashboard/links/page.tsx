import type { Metadata } from 'next';
import type { PaymentLinkView } from '@donpay/shared';
import { LinkForm } from '@/components/organisms/link-form';
import { LinksTable } from '@/components/organisms/links-table';
import { merchantApiFetch } from '@/lib/api-server';

export const metadata: Metadata = {
  title: 'Payment links — DonPay',
};

export default async function LinksPage() {
  const result = await merchantApiFetch<PaymentLinkView[]>('/merchants/me/links');
  const links = result.ok ? result.data : [];

  return (
    <div className="space-y-8">
      <div className="rise-in">
        <h1 className="font-display text-3xl tracking-tight">Payment links</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Shareable checkout pages. One-time or reusable — rates lock when the customer
          opens checkout, never here.
        </p>
      </div>

      <div className="rise-in" style={{ '--rise-order': 1 } as React.CSSProperties}>
        <LinkForm />
      </div>

      <section
        aria-labelledby="links-heading"
        className="rise-in"
        style={{ '--rise-order': 2 } as React.CSSProperties}
      >
        <h2 id="links-heading" className="font-display text-lg tracking-tight">
          Your links
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-surface">
          <LinksTable links={links} />
        </div>
      </section>
    </div>
  );
}
