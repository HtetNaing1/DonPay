import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LoginInput, SignupInput, WalletVerifyInput } from '@donpay/shared';
import * as argon2 from 'argon2';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Env } from '../config/env';
import { Merchant, Prisma } from '../generated/prisma/client';
import {
  MerchantProfile,
  toMerchantProfile,
} from '../merchants/merchant-profile';
import { PrismaService } from '../prisma/prisma.service';
import { NonceService } from './nonce.service';

export interface SessionResponse {
  accessToken: string;
  expiresAt: string;
  merchant: MerchantProfile;
}

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so login timing doesn't reveal account existence. */
  private readonly decoyHash: Promise<string> = argon2.hash(
    'donpay-timing-decoy',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly nonceService: NonceService,
  ) {}

  async signup(input: SignupInput): Promise<SessionResponse> {
    const passwordHash = await argon2.hash(input.password);
    try {
      const merchant = await this.prisma.merchant.create({
        data: { email: input.email, passwordHash, name: input.name },
      });
      return this.createSession(merchant);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ProblemException(
          409,
          ERROR_CODES.CONFLICT,
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(input: LoginInput): Promise<SessionResponse> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { email: input.email },
    });
    const passwordHash = merchant?.passwordHash ?? (await this.decoyHash);
    const passwordOk = await argon2
      .verify(passwordHash, input.password)
      .catch(() => false);
    if (!merchant || !passwordOk) {
      throw new ProblemException(
        401,
        ERROR_CODES.UNAUTHORIZED,
        'Invalid email or password',
      );
    }
    return this.createSession(merchant);
  }

  /**
   * SIWS-style wallet login (PLAN.md FR-3): a valid WALLET_LOGIN signature
   * opens a session for the merchant owning that *verified* payout wallet.
   * Email stays the root identity — this is a second door, not a new account.
   */
  async walletLogin(input: WalletVerifyInput): Promise<SessionResponse> {
    const { address } = await this.nonceService.consume(input, 'WALLET_LOGIN');

    const wallet = await this.prisma.walletAddress.findFirst({
      where: { address, verifiedAt: { not: null } },
      include: { merchant: true },
    });
    if (!wallet) {
      // same response for unknown and unverified addresses — the login
      // endpoint must not double as a wallet-registration oracle
      throw new ProblemException(
        401,
        ERROR_CODES.UNAUTHORIZED,
        'No merchant account owns this wallet',
      );
    }
    return this.createSession(wallet.merchant);
  }

  private async createSession(merchant: Merchant): Promise<SessionResponse> {
    const ttlSeconds = this.config.get('AUTH_SESSION_TTL_SECONDS', {
      infer: true,
    });
    const accessToken = await this.jwt.signAsync({ sub: merchant.id });
    return {
      accessToken,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      merchant: toMerchantProfile(merchant),
    };
  }
}
