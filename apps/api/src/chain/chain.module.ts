import { Module } from '@nestjs/common';
import { REFERENCE_GENERATOR } from './reference-generator';
import { SolanaReferenceGenerator } from './solana.reference-generator';

/**
 * ChainAdapter implementations + ChainWatcherService. Services depend on the
 * CHAIN_ADAPTER token, never on a concrete adapter; new chains are new
 * adapters registered here (OCP). Reference generation is the first slice of
 * that contract — the rest of the adapter lands in week 2.
 */
@Module({
  providers: [
    SolanaReferenceGenerator,
    { provide: REFERENCE_GENERATOR, useExisting: SolanaReferenceGenerator },
  ],
  exports: [REFERENCE_GENERATOR],
})
export class ChainModule {}
