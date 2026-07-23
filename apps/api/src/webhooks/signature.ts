import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signing, Stripe-style: `donpay-signature: t=<unix>,v1=<hex>` where
 * v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). The timestamp is inside the
 * MAC, so a captured delivery cannot be replayed later — receivers reject
 * stale timestamps. `verifyWebhookSignature` is the reference implementation
 * the integration guide ships.
 */
export function signWebhook(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  // HMAC-SHA256 proves two things at once: the message wasn't tampered with,
  // AND the sender knows the shared secret (only DonPay and this merchant do).
  // We sign `timestamp.body` (not just body) so the timestamp is covered by the
  // MAC and can't be altered to defeat the replay check below.
  const mac = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
  // Ship both the timestamp and the MAC so the receiver can recompute and compare.
  return `t=${timestampSeconds},v1=${mac}`;
}

export function verifyWebhookSignature(
  secret: string,
  header: string,
  rawBody: string,
  options: { toleranceSeconds?: number; nowSeconds?: number } = {},
): boolean {
  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  // Parse "t=...,v1=..." into a lookup map.
  const parts = new Map(
    header.split(',').map((p) => p.split('=', 2) as [string, string]),
  );
  const timestamp = Number(parts.get('t'));
  const provided = parts.get('v1');
  if (!Number.isFinite(timestamp) || !provided) return false;
  // Replay window: reject deliveries whose timestamp is too old (or too far in
  // the future). A signature captured off the wire can't be resent days later.
  if (Math.abs(now - timestamp) > tolerance) return false;

  // Recompute the MAC over the same `timestamp.body` and compare.
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  // timingSafeEqual compares in constant time — it never short-circuits on the
  // first differing byte. A normal `===` leaks, via tiny timing differences,
  // how many leading bytes matched, which can let an attacker forge a MAC byte
  // by byte. Length is checked first because timingSafeEqual requires equal
  // lengths (and length isn't secret).
  return a.length === b.length && timingSafeEqual(a, b);
}
