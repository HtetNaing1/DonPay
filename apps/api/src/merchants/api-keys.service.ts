import { Inject, Injectable } from '@nestjs/common';
import {
  ApiKeySummary,
  CreateApiKeyInput,
  CreatedApiKey,
} from '@donpay/shared';
import { mintApiKey } from '../common/api-key';
import { Clock, CLOCK } from '../common/clock';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { ApiKey, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Merchant API keys: mint (full key returned exactly once), list, revoke.
 * Verification lives in ApiKeyGuard — this service never sees inbound keys.
 * Every query is merchantId-scoped (CLAUDE.md rule 4).
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(merchantId: string): Promise<ApiKeySummary[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(toSummary);
  }

  async create(
    merchantId: string,
    input: CreateApiKeyInput,
  ): Promise<CreatedApiKey> {
    // Prefix is a 48-bit random handle with a unique constraint; on the
    // astronomically rare collision, mint again rather than fail the request.
    for (let attempt = 0; ; attempt++) {
      const { key, prefix, keyHash } = mintApiKey();
      try {
        const row = await this.prisma.apiKey.create({
          data: { merchantId, label: input.label, prefix, keyHash },
        });
        return { ...toSummary(row), key };
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  /** Revoked keys stay listed (audit trail); revoking twice is a no-op. */
  async revoke(merchantId: string, keyId: string): Promise<ApiKeySummary> {
    await this.prisma.apiKey.updateMany({
      where: { id: keyId, merchantId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    const row = await this.prisma.apiKey.findFirst({
      where: { id: keyId, merchantId },
    });
    if (!row) {
      throw new ProblemException(
        404,
        ERROR_CODES.NOT_FOUND,
        'API key not found',
      );
    }
    return toSummary(row);
  }
}

function toSummary(key: ApiKey): ApiKeySummary {
  return {
    id: key.id,
    label: key.label,
    prefix: key.prefix,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}
