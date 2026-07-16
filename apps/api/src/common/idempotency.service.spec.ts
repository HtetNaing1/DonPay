import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';

function makeService() {
  const prisma = {
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
  const service = new IdempotencyService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('IdempotencyService', () => {
  it('find returns the stored response, keyed by (key, merchantId)', async () => {
    const { service, prisma } = makeService();
    expect(await service.find('m_1', 'key-1')).toBeNull();

    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      response: { id: 'pi_1' },
    });
    expect(await service.find('m_1', 'key-1')).toEqual({ id: 'pi_1' });
    expect(prisma.idempotencyRecord.findUnique).toHaveBeenCalledWith({
      where: { key_merchantId: { key: 'key-1', merchantId: 'm_1' } },
    });
  });

  it('save writes the response with its sha256 hash through the given tx', async () => {
    const { service, prisma } = makeService();

    await service.save(
      prisma as unknown as Prisma.TransactionClient,
      'm_1',
      'key-1',
      { id: 'pi_1' },
    );

    const { data } = prisma.idempotencyRecord.create.mock.calls[0][0];
    expect(data).toMatchObject({
      key: 'key-1',
      merchantId: 'm_1',
      response: { id: 'pi_1' },
    });
    expect(data.responseHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('isConflict recognizes only unique-constraint violations', () => {
    const { service } = makeService();
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const p2025 = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(service.isConflict(p2002)).toBe(true);
    expect(service.isConflict(p2025)).toBe(false);
    expect(service.isConflict(new Error('unique'))).toBe(false);
  });
});
