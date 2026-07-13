'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, signupSchema } from '@donpay/shared';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/molecules/form-field';

type Mode = 'login' | 'signup';

const formSchema = {
  login: loginSchema,
  signup: signupSchema,
} as const;

type FormValues = z.infer<typeof signupSchema>;

/** Maps the API's stable problem codes to copy the person can act on. */
const ERROR_COPY: Record<string, string> = {
  conflict: 'An account with this email already exists. Sign in instead?',
  unauthorized: 'Email or password is incorrect. Check both and try again.',
  validation_failed: 'Something in the form isn’t valid. Check the fields and try again.',
};

const FALLBACK_ERROR = 'Something went wrong on our side. Try again in a moment.';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rootError, setRootError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema[mode] as typeof signupSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    const result = await signIn('credentials', {
      redirect: false,
      mode,
      email: values.email,
      password: values.password,
      name: values.name ?? '',
    });
    if (result?.error) {
      setRootError(ERROR_COPY[result.code ?? ''] ?? FALLBACK_ERROR);
      return;
    }
    router.push(searchParams.get('callbackUrl') ?? '/dashboard');
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {mode === 'signup' && (
        <FormField
          label="Business name"
          placeholder="Kanda Jewellery"
          autoComplete="organization"
          error={errors.name?.message}
          {...register('name')}
        />
      )}
      <FormField
        label="Email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
        error={errors.password?.message}
        {...register('password')}
      />

      {rootError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive"
        >
          {rootError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-md bg-brand text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
      >
        {isSubmitting
          ? mode === 'signup'
            ? 'Creating account…'
            : 'Signing in…'
          : mode === 'signup'
            ? 'Create account'
            : 'Sign in'}
      </button>

      <p className="text-center text-sm text-ink-soft">
        {mode === 'signup' ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-brand-deep underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to DonPay?{' '}
            <Link href="/signup" className="text-brand-deep underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
