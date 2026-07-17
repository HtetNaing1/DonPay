import { Module } from '@nestjs/common';
import { CHAIN_ADAPTER } from './chain-adapter';
import { REFERENCE_GENERATOR } from './reference-generator';
import { HttpSolanaRpc, SOLANA_RPC } from './solana-rpc';
import { SolanaAdapter } from './solana.adapter';

/**
 * ChainAdapter implementations + (soon) ChainWatcherService. Services depend
 * on the CHAIN_ADAPTER token, never on a concrete adapter; new chains are
 * new adapters registered here (OCP) and must pass the contract suite in
 * chain-adapter.contract.ts (LSP). SolanaAdapter also serves the narrower
 * REFERENCE_GENERATOR slice that intent creation depends on (ISP).
 */
@Module({
  providers: [
    HttpSolanaRpc,
    { provide: SOLANA_RPC, useExisting: HttpSolanaRpc },
    SolanaAdapter,
    { provide: CHAIN_ADAPTER, useExisting: SolanaAdapter },
    { provide: REFERENCE_GENERATOR, useExisting: SolanaAdapter },
  ],
  exports: [CHAIN_ADAPTER, REFERENCE_GENERATOR],
})
export class ChainModule {}
