import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/organisms/auth-form';

export const metadata: Metadata = {
  title: 'Sign in — DonPay',
};

export default function LoginPage() {
  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Welcome back</h1>
      <p className="mt-2 mb-8 text-[15px] text-ink-soft">
        Sign in to your merchant dashboard.
      </p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
