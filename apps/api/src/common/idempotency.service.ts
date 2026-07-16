import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Idempotency-Key storage (CLAUDE.md rule 5): same key + same merchant
 * returns the stored response, never re-executes. Callers `find()` before
 * executing and `save()` inside the same transaction as their write, so a
 * mutation and its idempotency record commit or roll back together — a crash
 * can never leave an executed mutation that a retry would re-execute.
 * Concurrent same-key requests race on the (key, merchantId) primary key;
 * the loser rolls back and replays the winner's stored response.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async find(merchantId: string, key: string): Promise<unknown | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { key_merchantId: { key, merchantId } },
    });
    return record?.response ?? null;
  }

  async save(
    tx: Prisma.TransactionClient,
    merchantId: string,
    key: string,
    response: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.idempotencyRecord.create({
      data: {
        key,
        merchantId,
        response,
        responseHash: createHash('sha256')
          .update(JSON.stringify(response))
          .digest('hex'),
      },
    });
  }

  /** True for the unique-constraint error a lost same-key race produces. */
  isConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
