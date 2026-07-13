import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/organisms/auth-form';

export const metadata: Metadata = {
  title: 'Create your account — DonPay',
};

export default function SignupPage() {
  return (
    <div>
      <h1 className="rise-in font-display text-3xl tracking-tight">Start on devnet</h1>
      <p
        className="rise-in mt-2 mb-8 text-[15px] text-ink-soft"
        style={{ '--rise-order': 1 } as React.CSSProperties}
      >
        Create a merchant account, verify a payout wallet, and take your first payment in minutes.
      </p>
      <div className="rise-in" style={{ '--rise-order': 2 } as React.CSSProperties}>
        <Suspense>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </div>
  );
}
