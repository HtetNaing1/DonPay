import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/organisms/auth-form';

export const metadata: Metadata = {
  title: 'Sign in — DonPay',
};

export default function LoginPage() {
  return (
    <div>
      <h1 className="rise-in font-display text-3xl tracking-tight">Welcome back</h1>
      <p
        className="rise-in mt-2 mb-8 text-[15px] text-ink-soft"
        style={{ '--rise-order': 1 } as React.CSSProperties}
      >
        Sign in to your merchant dashboard.
      </p>
      <div className="rise-in" style={{ '--rise-order': 2 } as React.CSSProperties}>
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}
