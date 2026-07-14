import type { NoncePurpose } from './schemas/enums';
import type { WalletSignaturePayload } from './schemas/auth';

/**
 * Canonical rendering of the wallet sign message (PLAN.md "Auth design").
 * One implementation, two consumers: the web app renders this exact string
 * for the wallet to sign, and the API re-renders it to verify the signature.
 * The purpose comes from the server's nonce record, so a signature produced
 * for WALLET_VERIFY can never be replayed as WALLET_LOGIN — the bytes differ.
 */

const STATEMENT_BY_PURPOSE: Record<NoncePurpose, string> = {
  WALLET_VERIFY: 'wants you to verify ownership of your Solana account:',
  WALLET_LOGIN: 'wants you to sign in with your Solana account:',
};

export function buildWalletSignMessage(
  payload: WalletSignaturePayload,
  purpose: NoncePurpose,
): string {
  return [
    `${payload.domain} ${STATEMENT_BY_PURPOSE[purpose]}`,
    payload.address,
    '',
    `Purpose: ${purpose}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${payload.issuedAt}`,
  ].join('\n');
}
