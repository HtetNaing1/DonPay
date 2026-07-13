import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Merchant } from '../generated/prisma/client';
import { SessionRequest } from './session.guard';

/** Resolves the merchant attached by SessionGuard. Only valid on guarded routes. */
export const CurrentMerchant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Merchant => {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    if (!request.merchant) {
      throw new Error('CurrentMerchant used on a route without SessionGuard');
    }
    return request.merchant;
  },
);
