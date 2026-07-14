import { ConfigService } from '@nestjs/config';
import { buildWalletSignMessage, WalletVerifyInput } from '@donpay/shared';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { describe, expect, it, vi } from 'vitest';
import { NonceService } from '../auth/nonce.service';
import { Clock } from '../common/clock';
import { AuthNonce, Prisma, WalletAddress } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from './wallets.service';

const DOMAIN = 'donpay.test';
const NOW = new Date('2026-07-14T12:00:00.000Z');
const MERCHANT_ID = 'm_1';

const keypair = nacl.sign.keyPair();
const ADDRESS = bs58.encode(keypair.publicKey);

/**
 * Integration-style: a real NonceService verifies real ed25519 signatures;
 * only Prisma is mocked. $transaction runs its callback against the same mock.
 */
function makeService() {
  const prisma = {
    authNonce: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    walletAddress: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(
      (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        callback(prisma),
    ),
  };
  const config = {
    get: vi.fn((key: string) => (key === 'AUTH_DOMAIN' ? DOMAIN : 300)),
  } as unknown as ConfigService<never, true>;
  const clock: Clock = { now: () => NOW };
  const nonceService = new NonceService(
    prisma as unknown as PrismaService,
    config,
    clock,
  );
  const service = new WalletsService(
    prisma as unknown as PrismaService,
    nonceService,
    clock,
  );
  return { service, prisma };
}

function nonceRow(overrides: Partial<AuthNonce> = {}): AuthNonce {
  return {
    id: 'n_1',
    address: ADDRESS,
    nonce: 'test-nonce-0123456789',
    purpose: 'WALLET_VERIFY',
    expiresAt: new Date(NOW.getTime() + 60_000),
    usedAt: null,
    ...overrides,
  };
}

function walletRow(overrides: Partial<WalletAddress> = {}): WalletAddress {
  return {
    id: 'w_1',
    merchantId: MERCHANT_ID,
    address: ADDRESS,
    chain: 'SOLANA',
    verifiedAt: NOW,
    isDefault: true,
    ...overrides,
  };
}

/** Sign the canonical message exactly as the web wallet flow does. */
function signedInput(row: AuthNonce): WalletVerifyInput {
  const message = {
    domain: DOMAIN,
    address: row.address,
    nonce: row.nonce,
    issuedAt: NOW.toISOString(),
  };
  const bytes = new TextEncoder().encode(
    buildWalletSignMessage(message, 'WALLET_VERIFY'),
  );
  return {
    message,
    signature: bs58.encode(nacl.sign.detached(bytes, keypair.secretKey)),
  };
}

describe('WalletsService.verify', () => {
  it('verifies a signed nonce and stores the first wallet as default', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(nonceRow());
    prisma.walletAddress.count.mockResolvedValue(0);
    prisma.walletAddress.create.mockImplementation(
      ({ data }: { data: Partial<WalletAddress> }) =>
        Promise.resolve(walletRow(data)),
    );

    const wallet = await service.verify(MERCHANT_ID, signedInput(nonceRow()));

    expect(wallet).toEqual({
      id: 'w_1',
      address: ADDRESS,
      chain: 'SOLANA',
      verifiedAt: NOW.toISOString(),
      isDefault: true,
    });
    // nonce burned exactly once, atomically
    expect(prisma.authNonce.updateMany).toHaveBeenCalledWith({
      where: { id: 'n_1', usedAt: null },
      data: { usedAt: NOW },
    });
    // creation is merchant-scoped and marked verified now
    expect(prisma.walletAddress.create).toHaveBeenCalledWith({
      data: {
        merchantId: MERCHANT_ID,
        address: ADDRESS,
        verifiedAt: NOW,
        isDefault: true,
      },
    });
  });

  it('stores subsequent wallets as non-default', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(nonceRow());
    prisma.walletAddress.count.mockResolvedValue(1);
    prisma.walletAddress.create.mockImplementation(
      ({ data }: { data: Partial<WalletAddress> }) =>
        Promise.resolve(walletRow({ ...data, id: 'w_2' })),
    );

    const wallet = await service.verify(MERCHANT_ID, signedInput(nonceRow()));
    expect(wallet.isDefault).toBe(false);
  });

  it('rejects a forged signature and stores nothing', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(nonceRow());

    const forged = signedInput(nonceRow());
    const attacker = nacl.sign.keyPair();
    const bytes = new TextEncoder().encode(
      buildWalletSignMessage(forged.message, 'WALLET_VERIFY'),
    );
    forged.signature = bs58.encode(
      nacl.sign.detached(bytes, attacker.secretKey),
    );

    await expect(
      service.verify(MERCHANT_ID, forged),
    ).rejects.toMatchObject({ code: 'signature_invalid' });
    expect(prisma.walletAddress.create).not.toHaveBeenCalled();
  });

  it('rejects a nonce issued for wallet login', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(
      nonceRow({ purpose: 'WALLET_LOGIN' }),
    );

    await expect(
      service.verify(MERCHANT_ID, signedInput(nonceRow())),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });

  it('maps an already-registered address to a 409 conflict', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(nonceRow());
    prisma.walletAddress.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.verify(MERCHANT_ID, signedInput(nonceRow())),
    ).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });
});

describe('WalletsService.setDefault', () => {
  it('claims the target and unsets every other wallet, all merchant-scoped', async () => {
    const { service, prisma } = makeService();
    prisma.walletAddress.updateMany.mockResolvedValue({ count: 1 });
    prisma.walletAddress.findFirst.mockResolvedValue(
      walletRow({ id: 'w_2', isDefault: true }),
    );

    const wallet = await service.setDefault(MERCHANT_ID, 'w_2');

    expect(wallet.isDefault).toBe(true);
    expect(prisma.walletAddress.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'w_2', merchantId: MERCHANT_ID },
      data: { isDefault: true },
    });
    expect(prisma.walletAddress.updateMany).toHaveBeenNthCalledWith(2, {
      where: { merchantId: MERCHANT_ID, NOT: { id: 'w_2' } },
      data: { isDefault: false },
    });
  });

  it("404s on another merchant's wallet id without touching any row", async () => {
    const { service, prisma } = makeService();
    prisma.walletAddress.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.setDefault(MERCHANT_ID, 'w_other'),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(prisma.walletAddress.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('WalletsService.list', () => {
  it('only ever queries the given merchant, defaults first', async () => {
    const { service, prisma } = makeService();
    prisma.walletAddress.findMany.mockResolvedValue([walletRow()]);

    const wallets = await service.list(MERCHANT_ID);

    expect(wallets).toHaveLength(1);
    expect(prisma.walletAddress.findMany).toHaveBeenCalledWith({
      where: { merchantId: MERCHANT_ID },
      orderBy: [{ isDefault: 'desc' }, { verifiedAt: 'asc' }],
    });
  });
});
