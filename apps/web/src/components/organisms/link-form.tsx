'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreatePaymentLinkInput,
  FiatCurrency,
  PayToken,
  PaymentLinkFormInput,
  paymentLinkFormSchema,
  PaymentLinkView,
} from '@donpay/shared';
import { Controller, useForm } from 'react-hook-form';
import { createPaymentLink } from '@/app/dashboard/links/actions';
import { CopyButton } from '@/components/atoms/copy-button';
import { DateTimeField } from '@/components/molecules/date-time-field';
import { FormField } from '@/components/molecules/form-field';
import { SelectField, SelectOption } from '@/components/molecules/select-field';
import { cn } from '@/lib/utils';

const CURRENCY_OPTIONS: readonly SelectOption<FiatCurrency>[] = [
  { value: 'USD', label: 'USD', hint: 'US dollar' },
  { value: 'EUR', label: 'EUR', hint: 'Euro' },
  { value: 'JPY', label: 'JPY', hint: 'Japanese yen' },
];

const TOKEN_OPTIONS: readonly SelectOption<PayToken>[] = [
  { value: 'USDC', label: 'USDC', hint: 'USD stablecoin' },
  { value: 'SOL', label: 'SOL', hint: 'Solana native' },
];

const ERROR_COPY: Record<string, string> = {
  validation_failed: 'Something in the form isn’t valid. Check the fields and try again.',
  unauthorized: 'Your session has expired. Sign in again.',
};

const FALLBACK_ERROR = 'Something went wrong on our side. Try again in a moment.';

const DEFAULTS: PaymentLinkFormInput = {
  type: 'REUSABLE',
  amountMode: 'FIXED',
  fiatCurrency: 'USD',
  token: 'USDC',
  amountFiat: '',
  minFiat: '',
  maxFiat: '',
  note: '',
  expiresAt: '',
  maxUses: '',
};

/** Create a payment link. No rate is locked here — quotes happen at checkout open. */
export function LinkForm({ onCancel }: { onCancel?: () => void } = {}) {
  const router = useRouter();
  const [rootError, setRootError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentLinkView | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentLinkFormInput, unknown, CreatePaymentLinkInput>({
    resolver: zodResolver(paymentLinkFormSchema),
    defaultValues: DEFAULTS,
  });

  const type = watch('type');
  const amountMode = watch('amountMode');
  const fiatCurrency = watch('fiatCurrency');

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    const result = await createPaymentLink(values);
    if (!result.ok) {
      setRootError(ERROR_COPY[result.problem.code] ?? FALLBACK_ERROR);
      return;
    }
    setCreated(result.data);
    reset(DEFAULTS);
    router.refresh();
  });

  return (
    // No overflow-hidden on the card: the select/calendar popovers must escape it
    <section
      aria-labelledby="link-form-heading"
      className="rounded-xl border border-hairline bg-surface"
    >
      <div className="border-b border-hairline px-6 py-4">
        <h2 id="link-form-heading" className="font-display text-lg tracking-tight">
          Create a payment link
        </h2>
        <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-ink-soft">
          A link is configuration — the exchange rate locks when a customer opens checkout,
          not now.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5 px-6 py-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium text-ink">Link type</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ['REUSABLE', 'Reusable'],
                  ['ONE_TIME', 'One-time'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    'flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors duration-200',
                    type === value
                      ? 'border-brand/50 bg-brand/10 text-brand-deep'
                      : 'border-hairline text-ink-soft hover:border-ink-soft/50',
                  )}
                >
                  <input type="radio" value={value} className="sr-only" {...register('type')} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Amount</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ['FIXED', 'Fixed'],
                  ['PAYER_CHOOSES', 'Payer chooses'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    'flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors duration-200',
                    amountMode === value
                      ? 'border-brand/50 bg-brand/10 text-brand-deep'
                      : 'border-hairline text-ink-soft hover:border-ink-soft/50',
                  )}
                >
                  <input
                    type="radio"
                    value={value}
                    className="sr-only"
                    {...register('amountMode')}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Controller
            control={control}
            name="fiatCurrency"
            render={({ field }) => (
              <SelectField
                label="Currency"
                value={field.value}
                onChange={field.onChange}
                options={CURRENCY_OPTIONS}
              />
            )}
          />
          <Controller
            control={control}
            name="token"
            render={({ field }) => (
              <SelectField
                label="Settlement token"
                value={field.value}
                onChange={field.onChange}
                options={TOKEN_OPTIONS}
              />
            )}
          />
        </div>

        {amountMode === 'FIXED' ? (
          <FormField
            label={`Amount (${fiatCurrency})`}
            placeholder={fiatCurrency === 'JPY' ? '5000' : '25.00'}
            inputMode="decimal"
            error={errors.amountFiat?.message}
            className="sm:max-w-xs"
            {...register('amountFiat')}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label={`Minimum (${fiatCurrency})`}
              placeholder="Optional"
              inputMode="decimal"
              error={errors.minFiat?.message}
              {...register('minFiat')}
            />
            <FormField
              label={`Maximum (${fiatCurrency})`}
              placeholder="Optional"
              inputMode="decimal"
              error={errors.maxFiat?.message}
              {...register('maxFiat')}
            />
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Controller
            control={control}
            name="expiresAt"
            render={({ field }) => (
              <DateTimeField
                label="Expires"
                value={field.value}
                onChange={field.onChange}
                hint="Optional — the link stops accepting checkouts after this."
                error={errors.expiresAt?.message}
              />
            )}
          />
          {type === 'REUSABLE' && (
            <FormField
              label="Max uses"
              placeholder="Optional"
              inputMode="numeric"
              hint="Completes the link after this many payments."
              error={errors.maxUses?.message}
              {...register('maxUses')}
            />
          )}
        </div>

        <FormField
          label="Note"
          placeholder="Optional — shown on the checkout page"
          error={errors.note?.message}
          {...register('note')}
        />

        {rootError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive"
          >
            {rootError}
          </p>
        )}

        <div className="flex items-center gap-2.5">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-md bg-brand px-5 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
          >
            {isSubmitting ? 'Creating…' : 'Create link'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface px-5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {created && (
        <div className="mx-6 mb-5 rounded-md border border-brand/30 bg-brand/5 px-4 py-3.5">
          <p className="flex flex-wrap items-center gap-1 text-[13px] font-medium text-brand-deep">
            Link created —
            <span className="font-mono">{`/pay/${created.slug}`}</span>
            <CopyButton
              value={
                typeof window === 'undefined'
                  ? `/pay/${created.slug}`
                  : `${window.location.origin}/pay/${created.slug}`
              }
              label="Copy link URL"
              className="p-1.5"
            />
          </p>
        </div>
      )}
    </section>
  );
}
