import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayToken, tokenMinorToMajor } from '@donpay/shared';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { Env } from '../config/env';
import {
  ChainAdapter,
  ChainPayment,
  PaymentQuery,
  PaymentRequest,
  TxFinality,
} from './chain-adapter';
import { SOLANA_RPC, SolanaRpc, SolanaTransaction } from './solana-rpc';

/**
 * ChainAdapter for Solana (devnet in v1). Detection is balance-delta based:
 * what the payout wallet actually gained in the queried token — robust to
 * CPI, multiple instructions, and self-transfers, and it satisfies the
 * amount-honesty invariant by construction. Verification never trusts the
 * payer's instruction list, only the settled balances.
 */
@Injectable()
export class SolanaAdapter implements ChainAdapter {
  readonly chain = 'SOLANA' as const;
  private readonly usdcMint: string;

  constructor(
    @Inject(SOLANA_RPC) private readonly rpc: SolanaRpc,
    config: ConfigService<Env, true>,
  ) {
    this.usdcMint = config.get('USDC_MINT', { infer: true });
  }

  /**
   * A Solana Pay reference: a fresh ed25519 public key, attached to the
   * payment tx as a read-only account so it is findable by address lookup.
   * The secret key is discarded on the spot — the server holds no keys
   * (rule 1).
   */
  generateReference(): string {
    return bs58.encode(nacl.sign.keyPair().publicKey);
  }

  /** Solana Pay transfer-request URL (spec: amount in major units, percent-encoded params). */
  buildPaymentUrl(request: PaymentRequest): string {
    const params = [
      `amount=${tokenMinorToMajor(request.amountTokenMinor, request.token)}`,
    ];
    if (request.token !== 'SOL') {
      params.push(`spl-token=${this.mintFor(request.token)}`);
    }
    params.push(`reference=${request.reference}`);
    if (request.label !== undefined) {
      params.push(`label=${encodeURIComponent(request.label)}`);
    }
    if (request.message !== undefined) {
      params.push(`message=${encodeURIComponent(request.message)}`);
    }
    return `solana:${request.payoutAddress}?${params.join('&')}`;
  }

  async findPaymentsByReference(query: PaymentQuery): Promise<ChainPayment[]> {
    const signatures = await this.rpc.getSignaturesForAddress(query.reference);
    const payments: ChainPayment[] = [];
    // RPC returns newest-first; walk backwards so the result is oldest-first
    for (const info of [...signatures].reverse()) {
      if (info.err !== null) continue; // failed txs moved no funds
      const tx = await this.rpc.getTransaction(info.signature);
      if (!tx?.meta || tx.meta.err !== null) continue;
      const amountTokenMinor = this.receivedAmount(tx, query);
      if (amountTokenMinor <= 0n) continue; // reference present, but nothing was paid to this wallet in this token
      payments.push({
        txSignature: info.signature,
        payerAddress: tx.transaction.message.accountKeys[0]?.pubkey ?? '',
        amountTokenMinor,
        slot: BigInt(tx.slot),
      });
    }
    return payments;
  }

  async getFinality(txSignature: string): Promise<TxFinality> {
    const [status] = await this.rpc.getSignatureStatuses([txSignature]);
    if (!status || status.err !== null) return 'DROPPED';
    switch (status.confirmationStatus) {
      case 'processed':
        return 'PROCESSED';
      case 'confirmed':
        return 'CONFIRMED';
      case 'finalized':
        return 'FINALIZED';
    }
  }

  /** What the payout wallet gained in this tx, in token minor units. */
  private receivedAmount(tx: SolanaTransaction, query: PaymentQuery): bigint {
    const meta = tx.meta;
    if (!meta) return 0n;
    if (query.token === 'SOL') {
      const index = tx.transaction.message.accountKeys.findIndex(
        (key) => key.pubkey === query.payoutAddress,
      );
      if (index === -1) return 0n;
      const pre = meta.preBalances[index] ?? 0;
      const post = meta.postBalances[index] ?? 0;
      return BigInt(post) - BigInt(pre);
    }
    const mint = this.mintFor(query.token);
    const post = (meta.postTokenBalances ?? []).find(
      (balance) =>
        balance.owner === query.payoutAddress && balance.mint === mint,
    );
    if (!post) return 0n;
    const pre = (meta.preTokenBalances ?? []).find(
      (balance) => balance.accountIndex === post.accountIndex,
    );
    return (
      BigInt(post.uiTokenAmount.amount) -
      BigInt(pre?.uiTokenAmount.amount ?? '0')
    );
  }

  private mintFor(token: Exclude<PayToken, 'SOL'>): string {
    switch (token) {
      case 'USDC':
        return this.usdcMint;
    }
  }
}
