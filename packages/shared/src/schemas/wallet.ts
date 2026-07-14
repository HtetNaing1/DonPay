import { z } from 'zod';
import { chainSchema } from './enums';
import { solanaAddressSchema } from './primitives';

/** A merchant payout wallet as returned by the API (`/merchants/me/wallets`). */
export const merchantWalletSchema = z.object({
  id: z.string(),
  address: solanaAddressSchema,
  chain: chainSchema,
  verifiedAt: z.iso.datetime().nullable(),
  isDefault: z.boolean(),
});
export type MerchantWallet = z.infer<typeof merchantWalletSchema>;
