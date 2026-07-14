'use client';

import { useEffect, useState } from 'react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';

/**
 * Connect-to-Phantom state machine shared by the verify and login panels.
 * select() only marks the wallet in the adapter; the effect completes the
 * connection once the selection has landed (calling connect() in the same
 * tick as select() races the adapter's state update).
 */
export function usePhantomConnect() {
  const { wallets, wallet, select, connect, connected, connecting, publicKey, signMessage } =
    useWallet();
  const [pending, setPending] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const phantom = wallets.find((w) => w.adapter.name === 'Phantom');
  const phantomInstalled =
    phantom !== undefined &&
    (phantom.readyState === WalletReadyState.Installed ||
      phantom.readyState === WalletReadyState.Loadable);

  useEffect(() => {
    if (!pending || !wallet || connected || connecting) return;
    connect()
      .catch((cause: unknown) => {
        setConnectError(
          cause instanceof Error && cause.name === 'WalletConnectionError'
            ? 'Phantom declined the connection. Approve it in the popup to continue.'
            : 'Connecting to Phantom failed. Try again in a moment.',
        );
      })
      .finally(() => setPending(false));
  }, [pending, wallet, connected, connecting, connect]);

  const beginConnect = () => {
    setConnectError(null);
    if (!phantom || !phantomInstalled) {
      setConnectError('Phantom isn’t installed in this browser.');
      return;
    }
    setPending(true);
    select(phantom.adapter.name);
  };

  return {
    phantomInstalled,
    connected,
    connectPending: pending || connecting,
    connectError,
    beginConnect,
    publicKey,
    signMessage,
  };
}
