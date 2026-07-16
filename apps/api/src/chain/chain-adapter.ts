import { Chain, PayToken } from '@donpay/shared';
import { ReferenceGenerator } from './reference-generator';

/** What checkout needs to render a payable QR / wallet deep link. */
export interface PaymentRequest {
  payoutAddress: string;
  token: PayToken;
  /** Token amount in minor units (rule 7 — integers only). */
  amountTokenMinor: bigint;
  reference: string;
  /** Merchant name, shown by the wallet. */
  label?: string;
  /** Line item / note, shown by the wallet. */
  message?: string;
}

/**
 * Lookup key for on-chain payments. Deliberately carries no amount: adapters
 * report what was actually paid — under/overpayment is classified by the
 * watcher (rule 11), never filtered away at the chain layer.
 */
export interface PaymentQuery {
  reference: string;
  payoutAddress: string;
  token: PayToken;
}

/** A transfer found on chain, already verified against recipient and token. */
export interface ChainPayment {
  txSignature: string;
  payerAddress: string;
  /** What actually arrived, in token minor units — may be under or over the quote. */
  amountTokenMinor: bigint;
  /** Chain height marker (Solana slot / EVM block number). */
  slot: bigint;
}

/**
 * Chain-agnostic finality ladder. Solana: processed/confirmed/finalized
 * commitment. EVM: confirmation depth buckets (see docs/evm-adapter-design.md).
 * DROPPED = the chain no longer knows the signature (reorged out or never
 * landed) — watchers treat it as "payment gone", not an error.
 */
export type TxFinality = 'PROCESSED' | 'CONFIRMED' | 'FINALIZED' | 'DROPPED';

/**
 * The one seam between DonPay and a blockchain (OCP: new chains are new
 * implementations of this, registered in ChainModule — zero edits anywhere
 * else). Consumers inject the CHAIN_ADAPTER token, never a concrete class.
 *
 * Every implementation must satisfy the contract suite in
 * `chain-adapter.contract.ts` (LSP), whose invariants are:
 *
 * 1. **Reference uniqueness** — `generateReference()` never repeats, and a
 *    payment carrying reference A is never returned for a query on B.
 * 2. **Recipient/token verification** — a payment only matches its query if
 *    it paid the queried address in the queried token; the same reference
 *    sent to a different wallet or in a different token is not a payment.
 * 3. **Amount honesty** — the actual received amount is reported verbatim;
 *    under/overpayments are returned, never filtered.
 * 4. **Ordering** — multiple payments to one reference come back
 *    oldest-first, so "first payment wins" (FR-12) is well-defined.
 * 5. **Finality semantics** — finality only moves up the ladder; unknown
 *    signatures are DROPPED.
 */
export interface ChainAdapter extends ReferenceGenerator {
  readonly chain: Chain;
  /** Chain-specific payment URI (Solana Pay URL / EIP-681) for QR + deep link. Pure and deterministic. */
  buildPaymentUrl(request: PaymentRequest): string;
  /** All payments carrying the reference to this recipient in this token, oldest-first. */
  findPaymentsByReference(query: PaymentQuery): Promise<ChainPayment[]>;
  getFinality(txSignature: string): Promise<TxFinality>;
}

export const CHAIN_ADAPTER = Symbol('CHAIN_ADAPTER');
