import { ConfigService } from '@nestjs/config';
import { buildWalletSignMessage, WalletVerifyInput } from '@donpay/shared';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { AuthNonce, NoncePurpose } from '../generated/prisma/client';
import { NonceService } from './nonce.service';

const DOMAIN = 'donpay.test';
const NONCE_TTL_SECONDS = 300;
const NOW = new Date('2026-07-14T12:00:00.000Z');

function makeService(now: Date = NOW) {
  const prisma = {
    authNonce: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = {
    get: vi.fn((key: string) =>
      key === 'AUTH_DOMAIN' ? DOMAIN : NONCE_TTL_SECONDS,
    ),
  } as unknown as ConfigService<never, true>;
  const clock: Clock = { now: () => now };
  const service = new NonceService(
    prisma as unknown as PrismaService,
    config,
    clock,
  );
  return { service, prisma };
}

const keypair = nacl.sign.keyPair();
const ADDRESS = bs58.encode(keypair.publicKey);

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

/** What a well-behaved wallet client does: render the message and sign its UTF-8 bytes. */
function signedInput(
  row: AuthNonce,
  purpose: NoncePurpose,
  signWith: nacl.SignKeyPair = keypair,
): WalletVerifyInput {
  const message = {
    domain: DOMAIN,
    address: row.address,
    nonce: row.nonce,
    issuedAt: NOW.toISOString(),
  };
  const bytes = new TextEncoder().encode(
    buildWalletSignMessage(message, purpose),
  );
  return {
    message,
    signature: bs58.encode(nacl.sign.detached(bytes, signWith.secretKey)),
  };
}

describe('NonceService.issue', () => {
  it('persists a single-use nonce and returns the signable message', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.create.mockImplementation(
      ({ data }: { data: AuthNonce }) => Promise.resolve(nonceRow(data)),
    );

    const issued = await service.issue(ADDRESS, 'WALLET_LOGIN');

    const stored = prisma.authNonce.create.mock.calls[0]?.[0].data as {
      address: string;
      nonce: string;
      purpose: NoncePurpose;
      expiresAt: Date;
    };
    expect(stored.address).toBe(ADDRESS);
    expect(stored.purpose).toBe('WALLET_LOGIN');
    expect(stored.nonce.length).toBeGreaterThanOrEqual(16);
    expect(stored.expiresAt).toEqual(
      new Date(NOW.getTime() + NONCE_TTL_SECONDS * 1000),
    );

    expect(issued.message).toEqual({
      domain: DOMAIN,
      address: ADDRESS,
      nonce: stored.nonce,
      issuedAt: NOW.toISOString(),
    });
    expect(issued.messageText).toBe(
      buildWalletSignMessage(issued.message, 'WALLET_LOGIN'),
    );
  });

  it('generates a fresh nonce per call', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.create.mockResolvedValue(nonceRow());

    const a = await service.issue(ADDRESS, 'WALLET_VERIFY');
    const b = await service.issue(ADDRESS, 'WALLET_VERIFY');
    expect(a.message.nonce).not.toBe(b.message.nonce);
  });
});

describe('NonceService.consume', () => {
  it('accepts a valid signature and burns the nonce exactly once', async () => {
    const { service, prisma } = makeService();
    const row = nonceRow();
    prisma.authNonce.findUnique.mockResolvedValue(row);

    const result = await service.consume(
      signedInput(row, 'WALLET_VERIFY'),
      'WALLET_VERIFY',
    );

    expect(result).toEqual({ address: ADDRESS });
    expect(prisma.authNonce.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, usedAt: null },
      data: { usedAt: NOW },
    });
  });

  it('rejects a signature from a different key', async () => {
    const { service, prisma } = makeService();
    const row = nonceRow();
    prisma.authNonce.findUnique.mockResolvedValue(row);

    const attacker = nacl.sign.keyPair();
    await expect(
      service.consume(
        signedInput(row, 'WALLET_VERIFY', attacker),
        'WALLET_VERIFY',
      ),
    ).rejects.toMatchObject({ code: 'signature_invalid' });
    expect(prisma.authNonce.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown nonce', async () => {
    const { service, prisma } = makeService();
    prisma.authNonce.findUnique.mockResolvedValue(null);

    await expect(
      service.consume(signedInput(nonceRow(), 'WALLET_VERIFY'), 'WALLET_VERIFY'),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });

  it('rejects an expired nonce', async () => {
    const { service, prisma } = makeService();
    const row = nonceRow({ expiresAt: new Date(NOW.getTime() - 1) });
    prisma.authNonce.findUnique.mockResolvedValue(row);

    await expect(
      service.consume(signedInput(row, 'WALLET_VERIFY'), 'WALLET_VERIFY'),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });

  it('rejects an already-used nonce', async () => {
    const { service, prisma } = makeService();
    const row = nonceRow({ usedAt: new Date(NOW.getTime() - 1000) });
    prisma.authNonce.findUnique.mockResolvedValue(row);

    await expect(
      service.consume(signedInput(row, 'WALLET_VERIFY'), 'WALLET_VERIFY'),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });

  it('rejects a nonce issued for a different purpose, even with a valid signature', async () => {
    const { service, prisma } = makeService();
    const row = nonceRow({ purpose: 'WALLET_VERIFY' });
    prisma.authNonce.findUnique.mockResolvedValue(row);

    await expect(
      service.consume(signedInput(row, 'WALLET_LOGIN'), 'WALLET_LOGIN'),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });

  it('rejects a nonce issued to a different address', async () => {
    const { service, prisma } = makeService();
    const other = nacl.sign.keyPair();
    const row = nonceRow({ address: bs58.encode(other.publicKey) });
    prisma.authNonce.findUnique.mockResolvedValue(row);

    const input = signedInput(nonceRow(), 'WALLET_VERIFY');
    await expect(
      service.consume(input, 'WALLET_VERIFY'),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });

  it('rejects a message bound to a different domain', async () => {
    const { service, prisma } = makeService();
    const row = nonceRow();
    prisma.authNonce.findUnique.mockResolvedValue(row);

    const input = signedInput(row, 'WALLET_VERIFY');
    input.message.domain = 'evil.example';
    await expect(
      service.consume(input, 'WALLET_VERIFY'),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });

  it('loses the burn race gracefully: second concurrent submission fails', async () => {
    const { service, prisma } = makeService();
    const row = nonceRow();
    prisma.authNonce.findUnique.mockResolvedValue(row);
    prisma.authNonce.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.consume(signedInput(row, 'WALLET_VERIFY'), 'WALLET_VERIFY'),
    ).rejects.toMatchObject({ code: 'nonce_invalid' });
  });
});
