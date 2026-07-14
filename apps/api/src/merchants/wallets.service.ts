import { Inject, Injectable } from '@nestjs/common';
import { MerchantWallet, WalletVerifyInput } from '@donpay/shared';
import { NonceService } from '../auth/nonce.service';
import { Clock, CLOCK } from '../common/clock';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Prisma, WalletAddress } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Merchant payout wallets. Verification is proof of key ownership: the
 * merchant signs a nonce-bound message with the wallet (NonceService,
 * purpose WALLET_VERIFY) — no funds move, nothing touches the chain.
 * Every query is merchantId-scoped (CLAUDE.md rule 4).
 */
@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nonceService: NonceService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(merchantId: string): Promise<MerchantWallet[]> {
    const wallets = await this.prisma.walletAddress.findMany({
      where: { merchantId },
      orderBy: [{ isDefault: 'desc' }, { verifiedAt: 'asc' }],
    });
    return wallets.map(toMerchantWallet);
  }

  async verify(
    merchantId: string,
    input: WalletVerifyInput,
  ): Promise<MerchantWallet> {
    const { address } = await this.nonceService.consume(
      input,
      'WALLET_VERIFY',
    );

    try {
      const wallet = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.walletAddress.count({
          where: { merchantId },
        });
        return tx.walletAddress.create({
          data: {
            merchantId,
            address,
            verifiedAt: this.clock.now(),
            // First verified wallet is the payout default until changed
            isDefault: existing === 0,
          },
        });
      });
      return toMerchantWallet(wallet);
    } catch (error) {
      // address is globally unique; same message whether it's ours or another
      // tenant's, so the endpoint can't be used to probe registered wallets
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ProblemException(
          409,
          ERROR_CODES.CONFLICT,
          'This wallet address is already verified',
        );
      }
      throw error;
    }
  }

  async setDefault(
    merchantId: string,
    walletId: string,
  ): Promise<MerchantWallet> {
    const wallet = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.walletAddress.updateMany({
        where: { id: walletId, merchantId },
        data: { isDefault: true },
      });
      if (claimed.count === 0) {
        return null;
      }
      await tx.walletAddress.updateMany({
        where: { merchantId, NOT: { id: walletId } },
        data: { isDefault: false },
      });
      return tx.walletAddress.findFirst({
        where: { id: walletId, merchantId },
      });
    });
    if (!wallet) {
      throw new ProblemException(
        404,
        ERROR_CODES.NOT_FOUND,
        'Wallet not found',
      );
    }
    return toMerchantWallet(wallet);
  }
}

function toMerchantWallet(wallet: WalletAddress): MerchantWallet {
  return {
    id: wallet.id,
    address: wallet.address,
    chain: wallet.chain,
    verifiedAt: wallet.verifiedAt?.toISOString() ?? null,
    isDefault: wallet.isDefault,
  };
}
