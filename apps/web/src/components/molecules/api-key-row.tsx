interface ApiKeyRowProps {
  label: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
  /** Row-level control (e.g. a revoke button) rendered by the owner. */
  action?: React.ReactNode;
}

/** One API key: label, prefix handle (the secret is never available), dates. */
export function ApiKeyRow({ label, prefix, createdAt, revokedAt, action }: ApiKeyRowProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="truncate">{label}</span>
          {revokedAt && (
            <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              Revoked
            </span>
          )}
        </p>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-soft">
          <span className="font-mono">{prefix}…</span>
          <span aria-hidden="true">·</span>
          <span>
            {revokedAt
              ? `Revoked ${formatDate(revokedAt)}`
              : `Created ${formatDate(createdAt)}`}
          </span>
        </p>
      </div>
      {action}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
