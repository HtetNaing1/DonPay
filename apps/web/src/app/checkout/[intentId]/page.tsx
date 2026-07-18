import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckoutIntent } from '@donpay/shared';
import { Wordmark } from '@/components/atoms/wordmark';
import { CheckoutPanel } from '@/components/organisms/checkout-panel';
import { apiUrl } from '@/lib/api';

interface CheckoutPageProps {
  params: Promise<{ intentId: string }>;
}

/** Public checkout read — no auth; the id itself is the capability. */
async function fetchIntent(intentId: string): Promise<CheckoutIntent | null> {
  const response = await fetch(apiUrl(`/checkout/intents/${intentId}`), {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as CheckoutIntent;
}

export async function generateMetadata({
  params,
}: CheckoutPageProps): Promise<Metadata> {
  const { intentId } = await params;
  const intent = await fetchIntent(intentId);
  return {
    title: intent
      ? `Pay ${intent.merchantName} — DonPay`
      : 'Checkout — DonPay',
    robots: { index: false }, // capability URLs never belong in an index
  };
}

/**
 * Hosted checkout (`/checkout/[intentId]`): server-rendered ticket, then the
 * client panel keeps it live over the WS gateway. NFR-7: the payer sees a
 * complete, scannable page on first paint — no client fetch on the critical
 * path.
 */
export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { intentId } = await params;
  const intent = await fetchIntent(intentId);
  if (!intent) notFound();

  return (
    <main className="flex min-h-dvh flex-col items-center bg-paper px-4 pt-10 pb-16">
      <Wordmark className="mb-6 text-xl text-ink" />
      <CheckoutPanel initial={intent} />
    </main>
  );
}
