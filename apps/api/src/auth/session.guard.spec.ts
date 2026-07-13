import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SessionGuard, SessionRequest } from './session.guard';

const SECRET = 'test-secret-that-is-at-least-32-chars!!';

function makeGuard() {
  const prisma = { merchant: { findUnique: vi.fn() } };
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { expiresIn: 3600 },
  });
  const guard = new SessionGuard(jwt, prisma as unknown as PrismaService);
  return { guard, prisma, jwt };
}

function makeContext(authorization?: string) {
  const request = { headers: { authorization } } as SessionRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SessionGuard', () => {
  it('accepts a valid session token and attaches the merchant', async () => {
    const { guard, prisma, jwt } = makeGuard();
    const merchant = { id: 'm_1', email: 'a@b.co' };
    prisma.merchant.findUnique.mockResolvedValue(merchant);
    const token = await jwt.signAsync({ sub: 'm_1' });
    const { context, request } = makeContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.merchant).toBe(merchant);
    expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
      where: { id: 'm_1' },
    });
  });

  it('rejects a missing Authorization header', async () => {
    const { guard } = makeGuard();
    const { context } = makeContext(undefined);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Missing session token',
    });
  });

  it('rejects non-Bearer schemes and garbage tokens', async () => {
    const { guard, jwt } = makeGuard();
    const token = await jwt.signAsync({ sub: 'm_1' });
    for (const header of [
      `Basic ${token}`,
      'Bearer not-a-jwt',
      'Bearer sk_live_apikey',
    ]) {
      const { context } = makeContext(header);
      await expect(guard.canActivate(context), header).rejects.toMatchObject({
        code: 'unauthorized',
      });
    }
  });

  it('rejects a token signed with a different secret', async () => {
    const { guard } = makeGuard();
    const foreignJwt = new JwtService({
      secret: 'another-secret-that-is-32-chars-long!!',
      signOptions: { expiresIn: 3600 },
    });
    const token = await foreignJwt.signAsync({ sub: 'm_1' });
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a valid token whose merchant no longer exists', async () => {
    const { guard, prisma, jwt } = makeGuard();
    prisma.merchant.findUnique.mockResolvedValue(null);
    const token = await jwt.signAsync({ sub: 'm_gone' });
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});
