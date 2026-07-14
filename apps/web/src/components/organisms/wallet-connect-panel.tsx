'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletProvider } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import {
  requestWalletNonce,
  verifyPayoutWallet,
} from '@/app/dashboard/wallets/actions';
import { usePhantomConnect } from '@/lib/use-phantom-connect';

/** Maps the API's stable problem codes to copy the person can act on. */
const ERROR_COPY: Record<string, string> = {
  conflict: 'This wallet is already verified — check the list below.',
  nonce_invalid: 'The signing challenge expired. Try again.',
  signature_invalid:
    'The signature didn’t match this wallet. Reconnect and try again.',
  unauthorized: 'Your session has expired. Sign in again.',
};

const FALLBACK_ERROR = 'Something went wrong on our side. Try again in a moment.';

/**
 * Connect Phantom → sign the server's nonce message → verify. Signing stays
 * in the browser (non-custodial: the key never leaves the wallet); the signed
 * message goes to the API through a server action.
 */
export function WalletConnectPanel() {
  const adapters = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <WalletProvider wallets={adapters} autoConnect={false}>
      <PanelInner />
    </WalletProvider>
  );
}

type Phase = 'idle' | 'signing' | 'verified';

function PanelInner() {
  const router = useRouter();
  const {
    phantomInstalled,
    connected,
    connectPending,
    connectError,
    beginConnect,
    publicKey,
    signMessage,
  } = usePhantomConnect();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSignAndVerify = async () => {
    if (!publicKey || !signMessage) {
      setError('This wallet can’t sign messages. Use Phantom instead.');
      return;
    }
    setError(null);
    setPhase('signing');
    try {
      const address = publicKey.toBase58();
      const nonce = await requestWalletNonce(address);
      if (!nonce.ok) {
        setError(ERROR_COPY[nonce.problem.code] ?? FALLBACK_ERROR);
        setPhase('idle');
        return;
      }

      const signature = await signMessage(
        new TextEncoder().encode(nonce.data.messageText),
      );
      const verified = await verifyPayoutWallet({
        message: nonce.data.message,
        signature: bs58.encode(signature),
      });
      if (!verified.ok) {
        setError(ERROR_COPY[verified.problem.code] ?? FALLBACK_ERROR);
        setPhase('idle');
        return;
      }

      setPhase('verified');
      router.refresh();
    } catch {
      // wallet rejected the signature prompt, or signing failed
      setError('Signing was cancelled. Try again when you’re ready.');
      setPhase('idle');
    }
  };

  const shownError = error ?? connectError;

  return (
    <section
      aria-labelledby="wallet-verify-heading"
      className="overflow-hidden rounded-xl border border-hairline bg-surface"
    >
      <div className="border-b border-hairline px-6 py-4">
        <h2 id="wallet-verify-heading" className="font-display text-lg tracking-tight">
          Verify a payout wallet
        </h2>
        <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-ink-soft">
          Sign a one-time message to prove you own the address payments settle to. Nothing is
          sent on-chain and no funds move — DonPay never holds keys.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-6 py-5">
        {!connected ? (
          <>
            <button
              type="button"
              onClick={beginConnect}
              disabled={connectPending}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
            >
              {connectPending ? 'Connecting…' : 'Connect Phantom'}
            </button>
            {!phantomInstalled && (
              <p className="text-sm text-ink-soft">
                No Phantom?{' '}
                <a
                  href="https://phantom.app/download"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-deep underline-offset-4 hover:underline"
                >
                  Install the extension
                </a>{' '}
                and reload this page.
              </p>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleSignAndVerify()}
              disabled={phase === 'signing' || phase === 'verified'}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
            >
              {phase === 'signing'
                ? 'Waiting for signature…'
                : phase === 'verified'
                  ? 'Wallet verified'
                  : 'Sign & verify'}
            </button>
            {publicKey && (
              <p className="font-mono text-[13px] text-ink-soft" title={publicKey.toBase58()}>
                {`${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`}
              </p>
            )}
          </>
        )}
      </div>

      {shownError && (
        <p
          role="alert"
          className="mx-6 mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive"
        >
          {shownError}
        </p>
      )}
      {phase === 'verified' && (
        <p className="mx-6 mb-5 rounded-md border border-brand/30 bg-brand/5 px-3.5 py-2.5 text-[13px] text-brand-deep">
          Wallet verified — payments can now settle to this address.
        </p>
      )}
    </section>
  );
}
