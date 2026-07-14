import { createHash, randomBytes } from 'node:crypto';

/**
 * API key codec, shared by ApiKeysService (mint) and ApiKeyGuard (verify).
 * Keys carry 192 bits of entropy, so a fast unsalted sha256 is the right
 * store format — argon2's cost factor exists for low-entropy passwords.
 * Only the hash is persisted; the full key is shown once (CLAUDE.md rule 9).
 */

/** `sk_` + 8 chars: the unique lookup handle, also shown in the dashboard. */
export const API_KEY_PREFIX_LENGTH = 11;

export interface MintedApiKey {
  key: string;
  prefix: string;
  keyHash: string;
}

export function mintApiKey(): MintedApiKey {
  const key = `sk_${randomBytes(24).toString('base64url')}`;
  return {
    key,
    prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
    keyHash: hashApiKey(key),
  };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
