'use client';

import { useState } from 'react';
import type { CreatedApiKey } from '@donpay/shared';
import { createApiKey } from '@/app/dashboard/api-keys/actions';
import { CopyButton } from '@/components/atoms/copy-button';
import { FormField } from '@/components/molecules/form-field';

/** Maps the API's stable problem codes to copy the person can act on. */
const ERROR_COPY: Record<string, string> = {
  validation_failed: 'Give the key a short label (up to 100 characters).',
  unauthorized: 'Your session has expired. Sign in again.',
};

const FALLBACK_ERROR = 'Something went wrong on our side. Try again in a moment.';

/**
 * Create a key, then reveal it exactly once. The API never returns the
 * secret again, so the reveal stays until the person dismisses it.
 */
export function ApiKeyCreatePanel() {
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await createApiKey({ label: label.trim() });
    setPending(false);
    if (!result.ok) {
      setError(ERROR_COPY[result.problem.code] ?? FALLBACK_ERROR);
      return;
    }
    setCreatedKey(result.data);
    setLabel('');
  };

  return (
    <section
      aria-labelledby="api-key-create-heading"
      className="overflow-hidden rounded-xl border border-hairline bg-surface"
    >
      <div className="border-b border-hairline px-6 py-4">
        <h2 id="api-key-create-heading" className="font-display text-lg tracking-tight">
          Create an API key
        </h2>
        <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-ink-soft">
          Keys authenticate server-to-server calls. Each key is shown once at creation —
          store it in your secret manager, not in code.
        </p>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-wrap items-end gap-4 px-6 py-5"
      >
        <FormField
          label="Label"
          placeholder="e.g. Production server"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          maxLength={100}
          className="w-full max-w-sm"
        />
        <button
          type="submit"
          disabled={pending || label.trim().length === 0}
          className="inline-flex h-11 cursor-pointer items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="mx-6 mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive"
        >
          {error}
        </p>
      )}

      {createdKey && (
        <div className="mx-6 mb-5 rounded-md border border-brand/30 bg-brand/5 px-4 py-3.5">
          <p className="text-[13px] font-medium text-brand-deep">
            {`“${createdKey.label}” created — copy the key now. For your security it won’t be shown again.`}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <code className="min-w-0 flex-1 truncate rounded-md border border-hairline bg-surface px-3 py-2 font-mono text-[13px] text-ink">
              {createdKey.key}
            </code>
            <CopyButton value={createdKey.key} label="Copy API key" />
          </div>
          <button
            type="button"
            onClick={() => setCreatedKey(null)}
            className="mt-2.5 cursor-pointer text-[13px] font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            I’ve stored it — dismiss
          </button>
        </div>
      )}
    </section>
  );
}
