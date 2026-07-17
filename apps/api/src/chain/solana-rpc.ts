import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';

/**
 * The subset of Solana JSON-RPC the adapter needs — a narrow seam (rule "I")
 * so tests script chain behavior at the protocol level instead of mocking
 * HTTP. Shapes mirror the RPC responses (jsonParsed encoding), trimmed to
 * the fields we read.
 */
export interface SolanaSignatureInfo {
  signature: string;
  slot: number;
  /** Non-null = the transaction executed and failed; it moved no funds. */
  err: unknown;
}

export interface SolanaTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

export interface SolanaTransaction {
  slot: number;
  meta: {
    err: unknown;
    /** Lamports per account, indexed like accountKeys. */
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: SolanaTokenBalance[];
    postTokenBalances?: SolanaTokenBalance[];
  } | null;
  transaction: {
    message: {
      /** First key is the fee payer. */
      accountKeys: { pubkey: string; signer: boolean }[];
    };
  };
}

export interface SolanaSignatureStatus {
  confirmationStatus: 'processed' | 'confirmed' | 'finalized';
  err: unknown;
}

export interface SolanaRpc {
  /** Newest-first, like the real RPC. */
  getSignaturesForAddress(address: string): Promise<SolanaSignatureInfo[]>;
  getTransaction(signature: string): Promise<SolanaTransaction | null>;
  getSignatureStatuses(
    signatures: string[],
  ): Promise<(SolanaSignatureStatus | null)[]>;
}

export const SOLANA_RPC = Symbol('SOLANA_RPC');

/** fetch-based client for the endpoint in SOLANA_RPC_URL (Helius in deploys). */
@Injectable()
export class HttpSolanaRpc implements SolanaRpc {
  private readonly url: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = config.get('SOLANA_RPC_URL', { infer: true });
  }

  getSignaturesForAddress(address: string): Promise<SolanaSignatureInfo[]> {
    return this.call('getSignaturesForAddress', [address, { limit: 100 }]);
  }

  getTransaction(signature: string): Promise<SolanaTransaction | null> {
    return this.call('getTransaction', [
      signature,
      {
        encoding: 'jsonParsed',
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      },
    ]);
  }

  async getSignatureStatuses(
    signatures: string[],
  ): Promise<(SolanaSignatureStatus | null)[]> {
    const result = await this.call<{
      value: (SolanaSignatureStatus | null)[];
    }>('getSignatureStatuses', [
      signatures,
      { searchTransactionHistory: true },
    ]);
    return result.value;
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) {
      throw new Error(`Solana RPC ${method}: HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      result?: T;
      error?: { code: number; message: string };
    };
    if (body.error) {
      throw new Error(
        `Solana RPC ${method}: ${body.error.message} (${body.error.code})`,
      );
    }
    return body.result as T;
  }
}
