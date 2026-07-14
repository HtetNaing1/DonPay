'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletProvider } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { signIn } from 'next-auth/react';
import { requestLoginNonce } from '@/app/(auth)/login/actions';
import { usePhantomConnect } from '@/lib/use-phantom-connect';

/** Maps the API's stable problem codes to copy the person can act on. */
const ERROR_COPY: Record<string, string> = {
  unauthorized:
    'No account owns this wallet. Sign in with email first, then verify the wallet under Wallets.',
  nonce_invalid: 'The signing challenge expired. Try again.',
  signature_invalid:
    'The signature didn’t match this wallet. Reconnect and try again.',
};

const FALLBACK_ERROR = 'Something went wrong on our side. Try again in a moment.';

/**
 * SIWS-style login: connect Phantom, sign the server's nonce message, and
 * open a session for the merchant who verified this wallet. A second door —
 * email+password stays the root identity.
 */
export function WalletLoginPanel() {
  const adapters = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <WalletProvider wallets={adapters} autoConnect={false}>
      <PanelInner />
    </WalletProvider>
  );
}

function PanelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    phantomInstalled,
    connected,
    connectPending,
    connectError,
    beginConnect,
    publicKey,
    signMessage,
  } = usePhantomConnect();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWalletSignIn = async () => {
    if (!publicKey || !signMessage) {
      setError('This wallet can’t sign messages. Use Phantom instead.');
      return;
    }
    setError(null);
    setSigning(true);
    try {
      const nonce = await requestLoginNonce(publicKey.toBase58());
      if (!nonce.ok) {
        setError(ERROR_COPY[nonce.problem.code] ?? FALLBACK_ERROR);
        return;
      }

      const signature = await signMessage(
        new TextEncoder().encode(nonce.data.messageText),
      );
      const result = await signIn('wallet', {
        redirect: false,
        message: JSON.stringify(nonce.data.message),
        signature: bs58.encode(signature),
      });
      if (result?.error) {
        setError(ERROR_COPY[result.code ?? ''] ?? FALLBACK_ERROR);
        return;
      }

      router.push(searchParams.get('callbackUrl') ?? '/dashboard');
      router.refresh();
    } catch {
      // wallet rejected the signature prompt, or signing failed
      setError('Signing was cancelled. Try again when you’re ready.');
    } finally {
      setSigning(false);
    }
  };

  const shownError = error ?? connectError;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span className="font-mono text-[11px] tracking-widest text-ink-soft/70 uppercase">
          or
        </span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      {!connected ? (
        <button
          type="button"
          onClick={beginConnect}
          disabled={connectPending}
          className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
        >
          {connectPending ? 'Connecting…' : 'Sign in with wallet'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleWalletSignIn()}
          disabled={signing}
          className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-hairline bg-surface text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
        >
          {signing ? (
            'Waiting for signature…'
          ) : (
            <>
              Sign in as
              <span className="font-mono text-[13px] text-ink-soft">
                {publicKey
                  ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
                  : ''}
              </span>
            </>
          )}
        </button>
      )}

      {!phantomInstalled && !connected && (
        <p className="text-center text-[13px] text-ink-soft">
          Wallet sign-in needs the{' '}
          <a
            href="https://phantom.app/download"
            target="_blank"
            rel="noreferrer"
            className="text-brand-deep underline-offset-4 hover:underline"
          >
            Phantom extension
          </a>
          .
        </p>
      )}

      {shownError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive"
        >
          {shownError}
        </p>
      )}
    </div>
  );
}
