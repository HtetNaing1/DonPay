import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { ProblemException } from '../common/problem/problem.exception';
import { Merchant, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const SECRET = 'test-secret-that-is-at-least-32-chars!!';
const TTL_SECONDS = 3600;

function makeService() {
  const prisma = {
    merchant: { create: vi.fn(), findUnique: vi.fn() },
  };
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { expiresIn: TTL_SECONDS },
  });
  const config = {
    get: vi.fn().mockReturnValue(TTL_SECONDS),
  } as unknown as ConfigService<never, true>;
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    config,
  );
  return { service, prisma, jwt };
}

function merchantRow(overrides: Partial<Merchant> = {}): Merchant {
  return {
    id: 'm_1',
    email: 'a@b.co',
    passwordHash: 'unset',
    name: 'Shop',
    createdAt: new Date('2026-07-13T00:00:00Z'),
    ...overrides,
  };
}

describe('AuthService.signup', () => {
  it('stores an argon2 hash (never the plaintext) and returns a session', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.merchant.create.mockImplementation(
      ({
        data,
      }: {
        data: { email: string; passwordHash: string; name: string };
      }) => Promise.resolve(merchantRow(data)),
    );

    const session = await service.signup({
      email: 'a@b.co',
      password: 'correct-horse',
      name: 'Shop',
    });

    const stored = prisma.merchant.create.mock.calls[0]?.[0].data
      .passwordHash as string;
    expect(stored).not.toContain('correct-horse');
    await expect(argon2.verify(stored, 'correct-horse')).resolves.toBe(true);

    const payload = await jwt.verifyAsync<{ sub: string }>(session.accessToken);
    expect(payload.sub).toBe('m_1');
    expect(session.merchant).not.toHaveProperty('passwordHash');
  });

  it('maps a unique-email violation to a 409 conflict problem', async () => {
    const { service, prisma } = makeService();
    prisma.merchant.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const attempt = service.signup({
      email: 'a@b.co',
      password: 'correct-horse',
      name: 'Shop',
    });
    await expect(attempt).rejects.toBeInstanceOf(ProblemException);
    await expect(attempt).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('AuthService.login', () => {
  it('returns a session for valid credentials', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.merchant.findUnique.mockResolvedValue(
      merchantRow({ passwordHash: await argon2.hash('correct-horse') }),
    );

    const session = await service.login({
      email: 'a@b.co',
      password: 'correct-horse',
    });
    const payload = await jwt.verifyAsync<{ sub: string }>(session.accessToken);
    expect(payload.sub).toBe('m_1');
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a wrong password with 401', async () => {
    const { service, prisma } = makeService();
    prisma.merchant.findUnique.mockResolvedValue(
      merchantRow({ passwordHash: await argon2.hash('correct-horse') }),
    );

    await expect(
      service.login({ email: 'a@b.co', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects an unknown email with the same 401 (no account enumeration)', async () => {
    const { service, prisma } = makeService();
    prisma.merchant.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@b.co', password: 'whatever' }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
