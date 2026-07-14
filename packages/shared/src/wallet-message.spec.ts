import { describe, expect, it } from 'vitest';
import { buildWalletSignMessage } from './wallet-message';
import type { WalletSignaturePayload } from './schemas/auth';

const payload: WalletSignaturePayload = {
  domain: 'donpay.example',
  address: 'DPay1111111111111111111111111111111111111111',
  nonce: 'abcdef0123456789abcdef',
  issuedAt: '2026-07-14T00:00:00.000Z',
};

describe('buildWalletSignMessage', () => {
  it('renders a stable, human-readable message bound to every field', () => {
    expect(buildWalletSignMessage(payload, 'WALLET_LOGIN')).toBe(
      [
        'donpay.example wants you to sign in with your Solana account:',
        'DPay1111111111111111111111111111111111111111',
        '',
        'Purpose: WALLET_LOGIN',
        'Nonce: abcdef0123456789abcdef',
        'Issued At: 2026-07-14T00:00:00.000Z',
      ].join('\n'),
    );
  });

  it('produces different bytes per purpose, so signatures cannot cross over', () => {
    expect(buildWalletSignMessage(payload, 'WALLET_VERIFY')).not.toBe(
      buildWalletSignMessage(payload, 'WALLET_LOGIN'),
    );
  });
});
