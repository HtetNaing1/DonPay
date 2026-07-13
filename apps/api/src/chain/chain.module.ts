import { Module } from '@nestjs/common';

/**
 * ChainAdapter implementations + ChainWatcherService. Services depend on the
 * CHAIN_ADAPTER token, never on a concrete adapter; new chains are new
 * adapters registered here (OCP).
 */
@Module({})
export class ChainModule {}
