import { Injectable } from '@nestjs/common';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { ReferenceGenerator } from './reference-generator';

/**
 * Solana Pay reference: a fresh ed25519 public key, included in the payment
 * transaction as a read-only account so the watcher can find it by signature
 * lookup. The secret key is discarded on the spot — no one can ever sign
 * with a reference (rule 1: the server holds no keys).
 */
@Injectable()
export class SolanaReferenceGenerator implements ReferenceGenerator {
  generateReference(): string {
    return bs58.encode(nacl.sign.keyPair().publicKey);
  }
}
