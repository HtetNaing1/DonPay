import type { Metadata } from 'next';
import type { ApiKeySummary } from '@donpay/shared';
import { ApiKeyRow } from '@/components/molecules/api-key-row';
import { ApiKeyCreatePanel } from '@/components/organisms/api-key-create-panel';
import { merchantApiFetch } from '@/lib/api-server';
import { revokeApiKey } from './actions';

export const metadata: Metadata = {
  title: 'API keys — DonPay',
};

export default async function ApiKeysPage() {
  const result = await merchantApiFetch<ApiKeySummary[]>('/merchants/me/api-keys');
  const keys = result.ok ? result.data : [];

  return (
    <div className="space-y-8">
      <div className="rise-in">
        <h1 className="font-display text-3xl tracking-tight">API keys</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Authenticate server-to-server calls to the DonPay API. Keys are stored hashed —
          each one is shown once, at creation.
        </p>
      </div>

      <div className="rise-in" style={{ '--rise-order': 1 } as React.CSSProperties}>
        <ApiKeyCreatePanel />
      </div>

      <section
        aria-labelledby="api-keys-heading"
        className="rise-in"
        style={{ '--rise-order': 2 } as React.CSSProperties}
      >
        <h2 id="api-keys-heading" className="font-display text-lg tracking-tight">
          Your keys
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-surface">
          {keys.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-mono text-[13px] text-ink-soft">No API keys yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
                Create your first key above to call the API — payment links and intents
                will authenticate with it.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {keys.map((apiKey) => (
                <li key={apiKey.id}>
                  <ApiKeyRow
                    label={apiKey.label}
                    prefix={apiKey.prefix}
                    createdAt={apiKey.createdAt}
                    revokedAt={apiKey.revokedAt}
                    action={
                      !apiKey.revokedAt && (
                        <form action={revokeApiKey.bind(null, apiKey.id)}>
                          <button
                            type="submit"
                            className="h-9 shrink-0 cursor-pointer rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-destructive/40 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          >
                            Revoke
                          </button>
                        </form>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
