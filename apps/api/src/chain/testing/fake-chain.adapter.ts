import { randomUUID } from 'node:crypto';
import { Chain } from '@donpay/shared';
import {
  ChainAdapter,
  ChainPayment,
  PaymentQuery,
  PaymentRequest,
  TxFinality,
} from '../chain-adapter';
import { SubmittedPayment } from '../chain-adapter-harness';

interface FakeTx extends Required<SubmittedPayment> {
  txSignature: string;
  slot: bigint;
}

/**
 * In-memory ChainAdapter for tests: the contract suite runs against it, and
 * watcher/e2e tests inject it via CHAIN_ADAPTER to script chain behavior.
 * `submitPayment`/`setFinality` are the test-side controls (its harness).
 */
export class FakeChainAdapter implements ChainAdapter {
  readonly chain: Chain = 'SOLANA';
  private slot = 0n;
  private readonly transactions: FakeTx[] = [];
  private readonly finality = new Map<string, TxFinality>();

  generateReference(): string {
    return `fakeref-${randomUUID()}`;
  }

  buildPaymentUrl(request: PaymentRequest): string {
    const params = new URLSearchParams({
      amount: request.amountTokenMinor.toString(),
      token: request.token,
      reference: request.reference,
    });
    if (request.label !== undefined) params.set('label', request.label);
    if (request.message !== undefined) params.set('message', request.message);
    return `fakepay:${request.payoutAddress}?${params.toString()}`;
  }

  async findPaymentsByReference(query: PaymentQuery): Promise<ChainPayment[]> {
    // insertion order = chain order, so the result is already oldest-first
    return this.transactions
      .filter(
        (tx) =>
          tx.reference === query.reference &&
          tx.payoutAddress === query.payoutAddress &&
          tx.token === query.token,
      )
      .map(({ txSignature, payerAddress, amountTokenMinor, slot }) => ({
        txSignature,
        payerAddress,
        amountTokenMinor,
        slot,
      }));
  }

  async getFinality(txSignature: string): Promise<TxFinality> {
    return this.finality.get(txSignature) ?? 'DROPPED';
  }

  // ---- harness controls (not part of ChainAdapter) ----

  submitPayment(payment: SubmittedPayment): string {
    const txSignature = `fakesig-${randomUUID()}`;
    this.transactions.push({
      payerAddress: 'fake-payer-default',
      ...payment,
      txSignature,
      slot: ++this.slot,
    });
    this.finality.set(txSignature, 'PROCESSED');
    return txSignature;
  }

  setFinality(txSignature: string, finality: TxFinality): void {
    if (!this.finality.has(txSignature)) {
      throw new Error(`Unknown fake tx: ${txSignature}`);
    }
    this.finality.set(txSignature, finality);
  }
}
