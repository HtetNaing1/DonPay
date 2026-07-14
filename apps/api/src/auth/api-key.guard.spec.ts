import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { API_KEY_PREFIX_LENGTH, hashApiKey, mintApiKey } from '../common/api-key';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyGuard, ApiKeyRequest } from './api-key.guard';

const MERCHANT = { id: 'm_1', email: 'a@b.co' };

function makeGuard() {
  const prisma = { apiKey: { findUnique: vi.fn().mockResolvedValue(null) } };
  const guard = new ApiKeyGuard(prisma as unknown as PrismaService);
  return { guard, prisma };
}

function makeContext(authorization?: string) {
  const request = { headers: { authorization } } as ApiKeyRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function storedRow(key: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'k_1',
    merchantId: MERCHANT.id,
    keyHash: hashApiKey(key),
    prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
    label: 'test',
    createdAt: new Date(),
    revokedAt: null,
    merchant: MERCHANT,
    ...overrides,
  };
}

describe('ApiKeyGuard', () => {
  it('accepts a valid key and attaches merchant and key id', async () => {
    const { guard, prisma } = makeGuard();
    const { key } = mintApiKey();
    prisma.apiKey.findUnique.mockResolvedValue(storedRow(key));
    const { context, request } = makeContext(`Bearer ${key}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.merchant).toBe(MERCHANT);
    expect(request.apiKeyId).toBe('k_1');
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { prefix: key.slice(0, API_KEY_PREFIX_LENGTH) },
      include: { merchant: true },
    });
  });

  it('rejects missing, non-Bearer, and non-sk_ credentials without a DB hit', async () => {
    const { guard, prisma } = makeGuard();
    for (const header of [
      undefined,
      'Bearer ',
      `Basic sk_${'a'.repeat(32)}`,
      'Bearer a-session-jwt-not-an-api-key',
      'Bearer sk_short',
    ]) {
      const { context } = makeContext(header);
      await expect(
        guard.canActivate(context),
        String(header),
      ).rejects.toMatchObject({ code: 'unauthorized' });
    }
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a key whose prefix matches no row', async () => {
    const { guard } = makeGuard();
    const { key } = mintApiKey();
    const { context } = makeContext(`Bearer ${key}`);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a key with a matching prefix but wrong secret', async () => {
    const { guard, prisma } = makeGuard();
    const real = mintApiKey();
    prisma.apiKey.findUnique.mockResolvedValue(storedRow(real.key));
    const forged = real.key.slice(0, API_KEY_PREFIX_LENGTH) + 'x'.repeat(24);
    const { context, request } = makeContext(`Bearer ${forged}`);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(request.merchant).toBeUndefined();
  });

  it('rejects a revoked key even when the secret is correct', async () => {
    const { guard, prisma } = makeGuard();
    const { key } = mintApiKey();
    prisma.apiKey.findUnique.mockResolvedValue(
      storedRow(key, { revokedAt: new Date() }),
    );
    const { context } = makeContext(`Bearer ${key}`);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});
