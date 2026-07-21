import type { Metadata } from 'next';
import type { IntentSummary, MerchantWallet, PaymentLinkView } from '@donpay/shared';
import { OnboardingSteps } from '@/components/organisms/onboarding-steps';
import { PaymentsWorkspace } from '@/components/organisms/payments-workspace';
import { merchantApiFetch } from '@/lib/api-server';

export const metadata: Metadata = {
  title: 'Payments — DonPay',
};

export default async function DashboardPage() {
  const [walletsResult, linksResult, intentsResult] = await Promise.all([
    merchantApiFetch<MerchantWallet[]>('/merchants/me/wallets'),
    merchantApiFetch<PaymentLinkView[]>('/merchants/me/links'),
    merchantApiFetch<IntentSummary[]>('/merchants/me/intents'),
  ]);

  const walletVerified = walletsResult.ok && walletsResult.data.length > 0;
  const hasLink = linksResult.ok && linksResult.data.length > 0;
  const intents = intentsResult.ok ? intentsResult.data : [];
  const links = linksResult.ok
    ? linksResult.data.map((link) => ({ id: link.id, slug: link.slug }))
    : [];

  // Guidance stays until the merchant is fully live — set up and taking payments.
  const showOnboarding = !(walletVerified && hasLink && intents.length > 0);

  return (
    <div className="space-y-8">
      <div className="rise-in">
        <h1 className="font-display text-3xl tracking-tight">Payments</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Every checkout that opens takes a row here — live from the chain watcher, newest first.
        </p>
      </div>

      {showOnboarding && (
        <div className="rise-in" style={{ '--rise-order': 1 } as React.CSSProperties}>
          <OnboardingSteps walletVerified={walletVerified} hasLink={hasLink} />
        </div>
      )}

      <div
        className="rise-in"
        style={{ '--rise-order': showOnboarding ? 2 : 1 } as React.CSSProperties}
      >
        <PaymentsWorkspace intents={intents} links={links} />
      </div>
    </div>
  );
}
