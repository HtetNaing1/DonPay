'use client';

import { useState } from 'react';
import {
  type CreatedWebhookEndpoint,
  type WebhookEvent,
  WEBHOOK_EVENTS,
} from '@donpay/shared';
import { createWebhookEndpoint } from '@/app/dashboard/webhooks/actions';
import { CopyButton } from '@/components/atoms/copy-button';
import { FormField } from '@/components/molecules/form-field';
import { WEBHOOK_EVENT_HINT, WEBHOOK_EVENT_LABEL } from '@/lib/webhook-events';

/** Maps the API's stable problem codes to copy the person can act on. */
const ERROR_COPY: Record<string, string> = {
  validation_failed:
    'Check the URL — it must use https (http is allowed only for localhost).',
  unauthorized: 'Your session has expired. Sign in again.',
};

const FALLBACK_ERROR = 'Something went wrong on our side. Try again in a moment.';

/**
 * Create an endpoint, then reveal its signing secret exactly once. The API
 * never returns the secret again, so the reveal stays until it is dismissed.
 */
export function WebhookCreatePanel() {
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<WebhookEvent>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWebhookEndpoint | null>(null);

  const toggle = (event: WebhookEvent) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });

  const canSubmit = url.trim().length > 0 && selected.size > 0 && !pending;

  const handleSubmit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    const result = await createWebhookEndpoint({
      url: url.trim(),
      events: [...selected],
      active: true,
    });
    setPending(false);
    if (!result.ok) {
      setError(ERROR_COPY[result.problem.code] ?? FALLBACK_ERROR);
      return;
    }
    setCreated(result.data);
    setUrl('');
    setSelected(new Set());
  };

  return (
    <section
      aria-labelledby="webhook-create-heading"
      className="overflow-hidden rounded-xl border border-hairline bg-surface"
    >
      <div className="border-b border-hairline px-6 py-4">
        <h2 id="webhook-create-heading" className="font-display text-lg tracking-tight">
          Add an endpoint
        </h2>
        <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-ink-soft">
          We’ll POST a signed JSON event to this URL each time a subscribed payment changes
          state. Verify the <code className="font-mono text-[13px]">donpay-signature</code> header
          with the secret shown at creation.
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="px-6 py-5">
        <FormField
          label="Endpoint URL"
          type="url"
          inputMode="url"
          placeholder="https://api.yourstore.com/webhooks/donpay"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          className="max-w-xl"
          hint="Must use https. http is allowed for localhost while you develop."
        />

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-ink">Events</legend>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            Pick at least one. You can change the destination later, but the secret is set once.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((event) => {
              const checked = selected.has(event);
              return (
                <label
                  key={event}
                  className="flex cursor-pointer gap-3 rounded-lg border border-hairline bg-surface px-3.5 py-3 transition-colors duration-200 hover:border-ink-soft/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(event)}
                    className="mt-0.5 size-4 shrink-0 accent-brand focus-visible:outline-none"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink">
                      {WEBHOOK_EVENT_LABEL[event]}
                      <span className="font-mono text-[11px] font-normal text-ink-soft">
                        {event}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">
                      {WEBHOOK_EVENT_HINT[event]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 inline-flex h-11 cursor-pointer items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
        >
          {pending ? 'Adding…' : 'Add endpoint'}
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

      {created && (
        <div className="mx-6 mb-5 rounded-md border border-brand/30 bg-brand/5 px-4 py-3.5">
          <p className="text-[13px] font-medium text-brand-deep">
            Endpoint added — copy the signing secret now. For your security it won’t be shown
            again.
          </p>
          <div className="mt-2 flex items-center gap-1">
            <code className="min-w-0 flex-1 truncate rounded-md border border-hairline bg-surface px-3 py-2 font-mono text-[13px] text-ink">
              {created.secret}
            </code>
            <CopyButton value={created.secret} label="Copy signing secret" />
          </div>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="mt-2.5 cursor-pointer text-[13px] font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            I’ve stored it — dismiss
          </button>
        </div>
      )}
    </section>
  );
}
