import { z } from 'zod';
import { MAX_FIAT_MINOR } from '../money';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Base58-encoded Solana public key (32 bytes → 32–44 chars). */
export const solanaAddressSchema = z
  .string()
  .min(32)
  .max(44)
  .regex(BASE58_RE, 'Must be a base58-encoded Solana address');

/** Base58-encoded ed25519 signature (64 bytes → 86–88 chars). */
export const base58SignatureSchema = z
  .string()
  .min(86)
  .max(88)
  .regex(BASE58_RE, 'Must be a base58-encoded signature');

/** Fiat amount in minor units — fits Postgres int4 (Prisma Int). */
export const fiatMinorAmountSchema = z.int().positive().max(MAX_FIAT_MINOR);
