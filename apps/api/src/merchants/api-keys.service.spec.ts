import { describe, expect, it, vi } from 'vitest';
import { API_KEY_PREFIX_LENGTH, hashApiKey } from '../common/api-key';
import { Clock } from '../common/clock';
import { ApiKey, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';

const NOW = new Date('2026-07-14T12:00:00.000Z');
const MERCHANT_ID = 'm_1';

function makeService() {
  const prisma = {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const clock: Clock = { now: () => NOW };
  const service = new ApiKeysService(
    prisma as unknown as PrismaService,
    clock,
  );
  return { service, prisma };
}

function keyRow(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'k_1',
    merchantId: MERCHANT_ID,
    keyHash: 'stored-hash',
    prefix: 'sk_abcd1234',
    label: 'CI deploys',
    createdAt: NOW,
    revokedAt: null,
    ...overrides,
  };
}

describe('ApiKeysService.create', () => {
  it('mints an sk_-prefixed key, stores only its hash, and returns the key once', async () => {
    const { service, prisma } = makeService();
    prisma.apiKey.create.mockImplementation(
      ({ data }: { data: Omit<ApiKey, 'id' | 'createdAt' | 'revokedAt'> }) =>
        Promise.resolve(keyRow(data)),
    );

    const created = await service.create(MERCHANT_ID, { label: 'CI deploys' });

    expect(created.key).toMatch(/^sk_[A-Za-z0-9_-]{32}$/);
    expect(created.prefix).toBe(created.key.slice(0, API_KEY_PREFIX_LENGTH));
    expect(created.label).toBe('CI deploys');
    expect(created.revokedAt).toBeNull();

    const stored = prisma.apiKey.create.mock.calls[0][0].data;
    expect(stored.merchantId).toBe(MERCHANT_ID);
    expect(stored.keyHash).toBe(hashApiKey(created.key));
    // the full key never reaches the database
    expect(Object.values(stored)).not.toContain(created.key);
  });

  it('mints a fresh key when the prefix collides, instead of failing', async () => {
    const { service, prisma } = makeService();
    const collision = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prisma.apiKey.create
      .mockRejectedValueOnce(collision)
      .mockImplementation(
        ({ data }: { data: Omit<ApiKey, 'id' | 'createdAt' | 'revokedAt'> }) =>
          Promise.resolve(keyRow(data)),
      );

    const created = await service.create(MERCHANT_ID, { label: 'retry' });

    expect(created.key).toMatch(/^sk_/);
    expect(prisma.apiKey.create).toHaveBeenCalledTimes(2);
    const [first, second] = prisma.apiKey.create.mock.calls;
    expect(first[0].data.prefix).not.toBe(second[0].data.prefix);
  });

  it('generates a distinct key and prefix per call', async () => {
    const { service, prisma } = makeService();
    prisma.apiKey.create.mockImplementation(
      ({ data }: { data: Omit<ApiKey, 'id' | 'createdAt' | 'revokedAt'> }) =>
        Promise.resolve(keyRow(data)),
    );

    const a = await service.create(MERCHANT_ID, { label: 'a' });
    const b = await service.create(MERCHANT_ID, { label: 'b' });
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).not.toBe(b.prefix);
  });
});

describe('ApiKeysService.list', () => {
  it('returns summaries without hash material, scoped to the merchant', async () => {
    const { service, prisma } = makeService();
    prisma.apiKey.findMany.mockResolvedValue([
      keyRow(),
      keyRow({ id: 'k_2', revokedAt: NOW }),
    ]);

    const keys = await service.list(MERCHANT_ID);

    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: MERCHANT_ID } }),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toEqual({
      id: 'k_1',
      label: 'CI deploys',
      prefix: 'sk_abcd1234',
      createdAt: NOW.toISOString(),
      revokedAt: null,
    });
    expect(keys[1].revokedAt).toBe(NOW.toISOString());
    for (const key of keys) {
      expect(key).not.toHaveProperty('keyHash');
      expect(key).not.toHaveProperty('key');
    }
  });
});

describe('ApiKeysService.revoke', () => {
  it('sets revokedAt only on the merchant-scoped, still-active row', async () => {
    const { service, prisma } = makeService();
    prisma.apiKey.findFirst.mockResolvedValue(keyRow({ revokedAt: NOW }));

    const revoked = await service.revoke(MERCHANT_ID, 'k_1');

    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'k_1', merchantId: MERCHANT_ID, revokedAt: null },
      data: { revokedAt: NOW },
    });
    expect(revoked.revokedAt).toBe(NOW.toISOString());
  });

  it('is a no-op on an already-revoked key', async () => {
    const { service, prisma } = makeService();
    const earlier = new Date('2026-07-01T00:00:00.000Z');
    prisma.apiKey.updateMany.mockResolvedValue({ count: 0 });
    prisma.apiKey.findFirst.mockResolvedValue(keyRow({ revokedAt: earlier }));

    const revoked = await service.revoke(MERCHANT_ID, 'k_1');
    expect(revoked.revokedAt).toBe(earlier.toISOString());
  });

  it("404s another tenant's key id — scoping, not a controller check", async () => {
    const { service, prisma } = makeService();
    prisma.apiKey.updateMany.mockResolvedValue({ count: 0 });
    prisma.apiKey.findFirst.mockResolvedValue(null);

    await expect(service.revoke(MERCHANT_ID, 'k_other')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: 'k_other', merchantId: MERCHANT_ID },
    });
  });
});
