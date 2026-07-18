import { describe, expect, it } from 'vitest';
import { signWebhook, verifyWebhookSignature } from './signature';

const SECRET = 'whsec_test_secret';
const BODY = '{"event":"intent.finalized","data":{"id":"pi_1"}}';
const NOW = 1_790_000_000;

describe('webhook signatures', () => {
  it('sign → verify roundtrip', () => {
    const header = signWebhook(SECRET, NOW, BODY);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(
      verifyWebhookSignature(SECRET, header, BODY, { nowSeconds: NOW }),
    ).toBe(true);
  });

  it('rejects a tampered body, wrong secret, and malformed headers', () => {
    const header = signWebhook(SECRET, NOW, BODY);
    expect(
      verifyWebhookSignature(SECRET, header, BODY + ' ', { nowSeconds: NOW }),
    ).toBe(false);
    expect(
      verifyWebhookSignature('whsec_other', header, BODY, { nowSeconds: NOW }),
    ).toBe(false);
    expect(verifyWebhookSignature(SECRET, 'garbage', BODY)).toBe(false);
    expect(verifyWebhookSignature(SECRET, 't=abc,v1=', BODY)).toBe(false);
  });

  it('rejects replays outside the timestamp tolerance', () => {
    const header = signWebhook(SECRET, NOW, BODY);
    expect(
      verifyWebhookSignature(SECRET, header, BODY, {
        nowSeconds: NOW + 301,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature(SECRET, header, BODY, {
        nowSeconds: NOW + 299,
        toleranceSeconds: 300,
      }),
    ).toBe(true);
  });
});
