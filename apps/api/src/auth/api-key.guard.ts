import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { API_KEY_PREFIX_LENGTH, hashApiKey } from '../common/api-key';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Merchant } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { extractBearerToken } from './session.guard';

export interface ApiKeyRequest extends Request {
  merchant?: Merchant;
  /** Correlates API-key requests in logs and idempotency records. */
  apiKeyId?: string;
}

/** Compared against when the prefix matches no row, so misses cost the same as hits. */
const DECOY_HASH = Buffer.from(hashApiKey('sk_decoy'), 'hex');

/**
 * API auth guard: verifies `Authorization: Bearer sk_...` and attaches the
 * merchant. Lookup goes by unique prefix; the presented key is re-hashed and
 * compared constant-time (both sides are 32-byte sha256 digests, so
 * timingSafeEqual never throws). Dashboard sessions are a separate guard —
 * no route accepts both (CLAUDE.md rule 9).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const key = extractBearerToken(request);
    if (!key || !key.startsWith('sk_') || key.length <= API_KEY_PREFIX_LENGTH) {
      throw this.unauthorized('Missing API key');
    }

    const row = await this.prisma.apiKey.findUnique({
      where: { prefix: key.slice(0, API_KEY_PREFIX_LENGTH) },
      include: { merchant: true },
    });

    const stored = row ? Buffer.from(row.keyHash, 'hex') : DECOY_HASH;
    const presented = Buffer.from(hashApiKey(key), 'hex');
    const match = timingSafeEqual(stored, presented);
    if (!row || !match || row.revokedAt !== null) {
      throw this.unauthorized('Invalid or revoked API key');
    }

    request.merchant = row.merchant;
    request.apiKeyId = row.id;
    return true;
  }

  private unauthorized(detail: string): ProblemException {
    return new ProblemException(401, ERROR_CODES.UNAUTHORIZED, detail);
  }
}
