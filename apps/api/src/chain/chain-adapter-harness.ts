import { PayToken } from '@donpay/shared';
import { ChainAdapter, TxFinality } from './chain-adapter';

/** A buyer-side payment the harness lands on the (fake or mocked) chain. */
export interface SubmittedPayment {
  reference: string;
  payoutAddress: string;
  token: PayToken;
  amountTokenMinor: bigint;
  payerAddress?: string;
}

/**
 * Test seam for the adapter contract suite: the suite drives payments and
 * finality through this, so it can run unchanged against the in-memory fake
 * (harness = the fake itself) or a real adapter over a mocked RPC (harness =
 * the mock's controls). Kept vitest-free so implementations can import it.
 */
export interface ChainAdapterHarness {
  adapter: ChainAdapter;
  /** Distinct, chain-valid recipient addresses + a payer for this chain. */
  addresses: { payout: string; otherPayout: string; payer: string };
  /** Lands a payment on chain; returns its txSignature (initial finality: PROCESSED). */
  submitPayment(payment: SubmittedPayment): Promise<string>;
  setFinality(txSignature: string, finality: TxFinality): Promise<void>;
}
