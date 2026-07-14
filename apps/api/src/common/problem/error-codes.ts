/**
 * Stable, documented error codes (OpenAPI + SDK contract). Add codes here;
 * never rename existing ones — API consumers match on them.
 */
export const ERROR_CODES = {
  BAD_REQUEST: 'bad_request',
  VALIDATION_FAILED: 'validation_failed',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  INTERNAL_ERROR: 'internal_error',
  /** Nonce unknown, expired, already used, or bound to different address/purpose/domain. */
  NONCE_INVALID: 'nonce_invalid',
  /** ed25519 signature does not verify against the claimed address. */
  SIGNATURE_INVALID: 'signature_invalid',
  /** Rate source is down and no cached rate is fresh enough to serve. */
  RATE_UNAVAILABLE: 'rate_unavailable',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Fallback code per HTTP status for exceptions that don't carry their own. */
export const DEFAULT_CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ERROR_CODES.BAD_REQUEST,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  429: ERROR_CODES.RATE_LIMITED,
};
