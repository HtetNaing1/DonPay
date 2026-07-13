import { Merchant } from '../generated/prisma/client';

/** The public shape of a merchant — everything except credentials. */
export interface MerchantProfile {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export function toMerchantProfile(merchant: Merchant): MerchantProfile {
  return {
    id: merchant.id,
    email: merchant.email,
    name: merchant.name,
    createdAt: merchant.createdAt,
  };
}
