/**
 * Mints the unique per-intent reference the chain watcher matches on.
 * Chain-specific (Solana: a pubkey attached to the transfer; EVM: a derived
 * deposit address — see docs/evm-adapter-design.md), so intent code depends
 * on this token, never on a concrete implementation (CLAUDE.md "D"). Folds
 * into ChainAdapter when the full interface lands in week 2.
 */
export interface ReferenceGenerator {
  /** A fresh, globally unique reference in the chain's address encoding. */
  generate(): string;
}

export const REFERENCE_GENERATOR = Symbol('REFERENCE_GENERATOR');
