import { z } from 'zod';
import { noncePurposeSchema } from './enums';
import { base58SignatureSchema, solanaAddressSchema } from './primitives';

export const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const nonceRequestSchema = z.object({
  address: solanaAddressSchema,
  purpose: noncePurposeSchema,
});
export type NonceRequestInput = z.infer<typeof nonceRequestSchema>;

/**
 * The structured message the wallet signs (PLAN.md "Auth design").
 * Domain-bound and nonce-bound; the server burns the nonce on use.
 */
export const walletSignaturePayloadSchema = z.object({
  domain: z.string().min(1),
  address: solanaAddressSchema,
  nonce: z.string().min(16),
  issuedAt: z.iso.datetime(),
});
export type WalletSignaturePayload = z.infer<typeof walletSignaturePayloadSchema>;

/** Body for both wallet payout verification and SIWS-style wallet login. */
export const walletVerifySchema = z.object({
  message: walletSignaturePayloadSchema,
  signature: base58SignatureSchema,
});
export type WalletVerifyInput = z.infer<typeof walletVerifySchema>;

/** Response of `GET /auth/nonce` — sign `messageText`, echo `message` back. */
export const issuedNonceSchema = z.object({
  message: walletSignaturePayloadSchema,
  /** Exact string to pass to the wallet's signMessage (UTF-8 encode as-is). */
  messageText: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type IssuedNonce = z.infer<typeof issuedNonceSchema>;
