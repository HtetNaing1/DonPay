import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';
import { SolanaReferenceGenerator } from './solana.reference-generator';

describe('SolanaReferenceGenerator', () => {
  it('mints base58-encoded 32-byte public keys, unique per call', () => {
    const generator = new SolanaReferenceGenerator();
    const references = Array.from({ length: 100 }, () => generator.generate());

    for (const reference of references) {
      expect(bs58.decode(reference)).toHaveLength(32);
    }
    expect(new Set(references).size).toBe(references.length);
  });
});
