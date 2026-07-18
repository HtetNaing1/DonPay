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
  const mac = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
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

  const parts = new Map(
    header.split(',').map((p) => p.split('=', 2) as [string, string]),
  );
  const timestamp = Number(parts.get('t'));
  const provided = parts.get('v1');
  if (!Number.isFinite(timestamp) || !provided) return false;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
