import { ConfigService } from '@nestjs/config';
import { PayToken } from '@donpay/shared';
import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';
import { Env } from '../config/env';
import { describeChainAdapterContract } from './chain-adapter.contract';
import {
  SolanaRpc,
  SolanaSignatureInfo,
  SolanaSignatureStatus,
  SolanaTransaction,
} from './solana-rpc';
import { SolanaAdapter } from './solana.adapter';

const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const PAYOUT = 'So11111111111111111111111111111111111111112';
const OTHER_PAYOUT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PAYER = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

interface LandedPayment {
  reference: string;
  payoutAddress: string;
  token: PayToken;
  amountTokenMinor: bigint;
  payerAddress?: string;
  failed?: boolean;
}

/**
 * Protocol-level fake of the Solana JSON-RPC — reproduces the quirks the
 * adapter must handle: newest-first signature lists, balance-array account
 * indexing, token balances keyed by owner+mint, statuses with err.
 */
class FakeSolanaRpc implements SolanaRpc {
  private slot = 1000;
  private counter = 0;
  private readonly signaturesByAddress = new Map<
    string,
    SolanaSignatureInfo[]
  >();
  private readonly transactions = new Map<string, SolanaTransaction>();
  private readonly statuses = new Map<string, SolanaSignatureStatus>();

  land(input: LandedPayment): string {
    const signature = `fake-sig-${++this.counter}`;
    const slot = ++this.slot;
    const err = input.failed ? { InstructionError: [0, 'Custom'] } : null;
    const payer = input.payerAddress ?? PAYER;
    const amount = Number(input.amountTokenMinor);
    const shared = {
      err,
      // index 0 = payer, 1 = payout wallet, 2 = reference (read-only)
      preBalances: [10_000_000_000, 5_000, 0],
      postBalances: [10_000_000_000 - 5_000, 5_000, 0], // fee only
    };
    const meta =
      input.token === 'SOL'
        ? {
            ...shared,
            postBalances: [10_000_000_000 - 5_000 - amount, 5_000 + amount, 0],
          }
        : {
            ...shared,
            preTokenBalances: [
              {
                accountIndex: 1,
                mint: USDC_MINT,
                owner: input.payoutAddress,
                uiTokenAmount: { amount: '250' },
              },
            ],
            postTokenBalances: [
              {
                accountIndex: 1,
                mint: USDC_MINT,
                owner: input.payoutAddress,
                uiTokenAmount: {
                  amount: (250n + input.amountTokenMinor).toString(),
                },
              },
            ],
          };
    this.transactions.set(signature, {
      slot,
      meta,
      transaction: {
        message: {
          accountKeys: [
            { pubkey: payer, signer: true },
            { pubkey: input.payoutAddress, signer: false },
            { pubkey: input.reference, signer: false },
          ],
        },
      },
    });
    const infos = this.signaturesByAddress.get(input.reference) ?? [];
    infos.unshift({ signature, slot, err }); // newest-first, like the real RPC
    this.signaturesByAddress.set(input.reference, infos);
    this.statuses.set(signature, { confirmationStatus: 'processed', err });
    return signature;
  }

  setConfirmation(
    signature: string,
    confirmationStatus: SolanaSignatureStatus['confirmationStatus'],
  ): void {
    const status = this.statuses.get(signature);
    if (!status) throw new Error(`Unknown fake signature: ${signature}`);
    this.statuses.set(signature, { ...status, confirmationStatus });
  }

  async getSignaturesForAddress(
    address: string,
  ): Promise<SolanaSignatureInfo[]> {
    return this.signaturesByAddress.get(address) ?? [];
  }

  async getTransaction(signature: string): Promise<SolanaTransaction | null> {
    return this.transactions.get(signature) ?? null;
  }

  async getSignatureStatuses(
    signatures: string[],
  ): Promise<(SolanaSignatureStatus | null)[]> {
    return signatures.map((s) => this.statuses.get(s) ?? null);
  }
}

const config = {
  get: (key: string) => (key === 'USDC_MINT' ? USDC_MINT : ''),
} as unknown as ConfigService<Env, true>;

function makeAdapter() {
  const rpc = new FakeSolanaRpc();
  return { rpc, adapter: new SolanaAdapter(rpc, config) };
}

// The contract every ChainAdapter must satisfy (LSP), over the mocked RPC.
describeChainAdapterContract('SolanaAdapter (mocked RPC)', () => {
  const { rpc, adapter } = makeAdapter();
  const toCommitment = {
    PROCESSED: 'processed',
    CONFIRMED: 'confirmed',
    FINALIZED: 'finalized',
  } as const;
  return {
    adapter,
    addresses: { payout: PAYOUT, otherPayout: OTHER_PAYOUT, payer: PAYER },
    submitPayment: async (payment) => rpc.land(payment),
    setFinality: async (signature, finality) => {
      if (finality === 'DROPPED') throw new Error('cannot set DROPPED');
      rpc.setConfirmation(signature, toCommitment[finality]);
    },
  };
});

describe('SolanaAdapter specifics', () => {
  it('builds a spec-compliant Solana Pay URL for SPL transfers', () => {
    const { adapter } = makeAdapter();
    const url = adapter.buildPaymentUrl({
      payoutAddress: PAYOUT,
      token: 'USDC',
      amountTokenMinor: 25_000_000n,
      reference: 'REF11111111111111111111111111111111111111111',
      label: 'Don Pay',
      message: 'Blue hoodie',
    });
    expect(url).toBe(
      `solana:${PAYOUT}?amount=25&spl-token=${USDC_MINT}` +
        '&reference=REF11111111111111111111111111111111111111111' +
        '&label=Don%20Pay&message=Blue%20hoodie',
    );
  });

  it('builds a native SOL URL with the amount in SOL, no spl-token param', () => {
    const { adapter } = makeAdapter();
    const url = adapter.buildPaymentUrl({
      payoutAddress: PAYOUT,
      token: 'SOL',
      amountTokenMinor: 405_090_336n,
      reference: 'REF11111111111111111111111111111111111111111',
    });
    expect(url).toContain('amount=0.405090336');
    expect(url).not.toContain('spl-token');
  });

  it('mints references that are unique 32-byte ed25519 public keys', () => {
    const { adapter } = makeAdapter();
    const references = Array.from({ length: 100 }, () =>
      adapter.generateReference(),
    );
    for (const reference of references) {
      expect(bs58.decode(reference)).toHaveLength(32);
    }
    expect(new Set(references).size).toBe(references.length);
  });

  it('excludes failed transactions — an errored tx moved no funds', async () => {
    const { rpc, adapter } = makeAdapter();
    const reference = adapter.generateReference();
    const signature = rpc.land({
      reference,
      payoutAddress: PAYOUT,
      token: 'USDC',
      amountTokenMinor: 25_000_000n,
      failed: true,
    });

    await expect(
      adapter.findPaymentsByReference({
        reference,
        payoutAddress: PAYOUT,
        token: 'USDC',
      }),
    ).resolves.toEqual([]);
    // and its finality reads as DROPPED, not a confirmation level
    await expect(adapter.getFinality(signature)).resolves.toBe('DROPPED');
  });

  it('a fee-only tx that references the intent but pays nothing is not a payment', async () => {
    const { rpc, adapter } = makeAdapter();
    const reference = adapter.generateReference();
    rpc.land({
      reference,
      payoutAddress: PAYOUT,
      token: 'SOL',
      amountTokenMinor: 0n,
    });

    await expect(
      adapter.findPaymentsByReference({
        reference,
        payoutAddress: PAYOUT,
        token: 'SOL',
      }),
    ).resolves.toEqual([]);
  });
});
