import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildWalletSignMessage,
  WalletSignaturePayload,
  WalletVerifyInput,
} from '@donpay/shared';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { Clock, CLOCK } from '../common/clock';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Env } from '../config/env';
import { NoncePurpose } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface IssuedNonce {
  /** The structured payload the wallet signs — echo it back in the verify call. */
  message: WalletSignaturePayload;
  /** Exact string to pass to the wallet's signMessage (UTF-8 encode as-is). */
  messageText: string;
  expiresAt: string;
}

/**
 * Single-use, expiring, domain-bound nonces (CLAUDE.md rule 8).
 * One implementation, two consumers: wallet payout verification and
 * SIWS-style wallet login both call issue() + consume().
 */
@Injectable()
export class NonceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(address: string, purpose: NoncePurpose): Promise<IssuedNonce> {
    const now = this.clock.now();
    const ttlSeconds = this.config.get('AUTH_NONCE_TTL_SECONDS', {
      infer: true,
    });
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const nonce = randomBytes(24).toString('base64url');

    await this.prisma.authNonce.create({
      data: { address, nonce, purpose, expiresAt },
    });

    const message: WalletSignaturePayload = {
      domain: this.config.get('AUTH_DOMAIN', { infer: true }),
      address,
      nonce,
      issuedAt: now.toISOString(),
    };
    return {
      message,
      messageText: buildWalletSignMessage(message, purpose),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Verifies the signed message and burns the nonce atomically; the burn is
   * guarded by `usedAt: null` so concurrent submissions of the same nonce
   * yield exactly one winner. Returns the address whose ownership was proven.
   */
  async consume(
    input: WalletVerifyInput,
    purpose: NoncePurpose,
  ): Promise<{ address: string }> {
    const { message, signature } = input;

    if (message.domain !== this.config.get('AUTH_DOMAIN', { infer: true })) {
      throw this.nonceInvalid();
    }

    const row = await this.prisma.authNonce.findUnique({
      where: { nonce: message.nonce },
    });
    if (
      !row ||
      row.purpose !== purpose ||
      row.address !== message.address ||
      row.usedAt !== null ||
      row.expiresAt <= this.clock.now()
    ) {
      throw this.nonceInvalid();
    }

    // Verify before burning, so a bad signature doesn't waste the nonce.
    const messageBytes = new TextEncoder().encode(
      buildWalletSignMessage(message, purpose),
    );
    const publicKey = bs58.decode(message.address);
    const signatureBytes = bs58.decode(signature);
    const signatureOk =
      publicKey.length === nacl.sign.publicKeyLength &&
      signatureBytes.length === nacl.sign.signatureLength &&
      nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
    if (!signatureOk) {
      throw new ProblemException(
        401,
        ERROR_CODES.SIGNATURE_INVALID,
        'Signature does not verify against the claimed address',
      );
    }

    const burned = await this.prisma.authNonce.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: this.clock.now() },
    });
    if (burned.count === 0) {
      throw this.nonceInvalid();
    }

    return { address: message.address };
  }

  private nonceInvalid(): ProblemException {
    return new ProblemException(
      401,
      ERROR_CODES.NONCE_INVALID,
      'Nonce is invalid, expired, or already used',
    );
  }
}
