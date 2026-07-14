import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { buildWalletSignMessage, WalletVerifyInput } from '@donpay/shared';
import * as argon2 from 'argon2';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock';
import { ProblemException } from '../common/problem/problem.exception';
import { AuthNonce, Merchant, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { NonceService } from './nonce.service';

const SECRET = 'test-secret-that-is-at-least-32-chars!!';
const TTL_SECONDS = 3600;
const DOMAIN = 'donpay.test';
const NOW = new Date('2026-07-14T12:00:00.000Z');

function makeService() {
  const prisma = {
    merchant: { create: vi.fn(), findUnique: vi.fn() },
    authNonce: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    walletAddress: { findFirst: vi.fn() },
  };
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { expiresIn: TTL_SECONDS },
  });
  const config = {
    get: vi.fn((key: string) =>
      key === 'AUTH_DOMAIN' ? DOMAIN : TTL_SECONDS,
    ),
  } as unknown as ConfigService<never, true>;
  const clock: Clock = { now: () => NOW };
  // real NonceService: wallet-login tests exercise real ed25519 verification
  const nonceService = new NonceService(
    prisma as unknown as PrismaService,
    config,
    clock,
  );
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    config,
    nonceService,
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

describe('AuthService.walletLogin', () => {
  const keypair = nacl.sign.keyPair();
  const ADDRESS = bs58.encode(keypair.publicKey);

  function nonceRow(overrides: Partial<AuthNonce> = {}): AuthNonce {
    return {
      id: 'n_1',
      address: ADDRESS,
      nonce: 'test-nonce-0123456789',
      purpose: 'WALLET_LOGIN',
      expiresAt: new Date(NOW.getTime() + 60_000),
      usedAt: null,
      ...overrides,
    };
  }

  /** Sign the canonical WALLET_LOGIN message exactly as the web wallet flow does. */
  function signedInput(
    signWith: nacl.SignKeyPair = keypair,
  ): WalletVerifyInput {
    const message = {
      domain: DOMAIN,
      address: ADDRESS,
      nonce: nonceRow().nonce,
      issuedAt: NOW.toISOString(),
    };
    const bytes = new TextEncoder().encode(
      buildWalletSignMessage(message, 'WALLET_LOGIN'),
    );
    return {
      message,
      signature: bs58.encode(nacl.sign.detached(bytes, signWith.secretKey)),
    };
  }

  it('opens a session for the merchant owning the verified wallet', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(nonceRow());
    prisma.walletAddress.findFirst.mockResolvedValue({
      id: 'w_1',
      merchantId: 'm_1',
      address: ADDRESS,
      chain: 'SOLANA',
      verifiedAt: NOW,
      isDefault: true,
      merchant: merchantRow(),
    });

    const session = await service.walletLogin(signedInput());

    const payload = await jwt.verifyAsync<{ sub: string }>(session.accessToken);
    expect(payload.sub).toBe('m_1');
    expect(session.merchant).not.toHaveProperty('passwordHash');
    // wallet lookup excludes unverified addresses
    expect(prisma.walletAddress.findFirst).toHaveBeenCalledWith({
      where: { address: ADDRESS, verifiedAt: { not: null } },
      include: { merchant: true },
    });
    // nonce burned exactly once
    expect(prisma.authNonce.updateMany).toHaveBeenCalledWith({
      where: { id: 'n_1', usedAt: null },
      data: { usedAt: NOW },
    });
  });

  it('401s when no merchant owns the wallet, after burning the nonce', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(nonceRow());
    prisma.walletAddress.findFirst.mockResolvedValue(null);

    await expect(service.walletLogin(signedInput())).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    });
    expect(prisma.authNonce.updateMany).toHaveBeenCalled();
  });

  it('rejects a forged signature without touching the wallet table', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(nonceRow());

    const attacker = nacl.sign.keyPair();
    await expect(
      service.walletLogin(signedInput(attacker)),
    ).rejects.toMatchObject({ code: 'signature_invalid' });
    expect(prisma.walletAddress.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a nonce issued for wallet verification (purpose crossover)', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(
      nonceRow({ purpose: 'WALLET_VERIFY' }),
    );

    await expect(service.walletLogin(signedInput())).rejects.toMatchObject({
      code: 'nonce_invalid',
    });
  });

  it('rejects a replayed (already-used) nonce', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(
      nonceRow({ usedAt: new Date(NOW.getTime() - 1000) }),
    );

    await expect(service.walletLogin(signedInput())).rejects.toMatchObject({
      code: 'nonce_invalid',
    });
  });
});
