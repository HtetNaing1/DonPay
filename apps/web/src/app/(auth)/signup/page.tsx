import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/organisms/auth-form';

export const metadata: Metadata = {
  title: 'Create your account — DonPay',
};

export default function SignupPage() {
  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Start on devnet</h1>
      <p className="mt-2 mb-8 text-[15px] text-ink-soft">
        Create a merchant account, verify a payout wallet, and take your first payment in minutes.
      </p>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
