import { Module } from '@nestjs/common';
import { REFERENCE_GENERATOR } from './reference-generator';
import { SolanaReferenceGenerator } from './solana.reference-generator';

/**
 * ChainAdapter implementations + ChainWatcherService. Services depend on the
 * CHAIN_ADAPTER token, never on a concrete adapter; new chains are new
 * adapters registered here (OCP) and must pass the contract suite in
 * chain-adapter.contract.ts (LSP). SolanaAdapter binds CHAIN_ADAPTER when it
 * lands; until then only the reference-generation slice is wired.
 */
@Module({
  providers: [
    SolanaReferenceGenerator,
    { provide: REFERENCE_GENERATOR, useExisting: SolanaReferenceGenerator },
  ],
  exports: [REFERENCE_GENERATOR],
})
export class ChainModule {}
