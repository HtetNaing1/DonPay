import { beforeEach, describe, expect, it } from 'vitest';
import { ChainAdapterHarness } from './chain-adapter-harness';

/**
 * The ChainAdapter contract (LSP — CLAUDE.md "L"): every implementation runs
 * this exact suite via its own harness; an adapter that needs the suite
 * relaxed is not a ChainAdapter. Invariants documented on the interface.
 *
 * Excluded from the Nest build (tsconfig.build.json `**​/*.contract.ts`)
 * because it imports vitest — import it only from spec files.
 */
export function describeChainAdapterContract(
  name: string,
  makeHarness: () => ChainAdapterHarness | Promise<ChainAdapterHarness>,
): void {
  describe(`ChainAdapter contract — ${name}`, () => {
    let harness: ChainAdapterHarness;

    beforeEach(async () => {
      harness = await makeHarness();
    });

    it('mints unique, non-empty references', () => {
      const references = Array.from({ length: 500 }, () =>
        harness.adapter.generateReference(),
      );
      expect(references.every((r) => r.length > 0)).toBe(true);
      expect(new Set(references).size).toBe(references.length);
    });

    it('builds deterministic payment URLs that differ per reference', () => {
      const request = {
        payoutAddress: harness.addresses.payout,
        token: 'USDC' as const,
        amountTokenMinor: 25_000_000n,
        reference: harness.adapter.generateReference(),
        label: 'DonPay Contract Shop',
        message: 'Blue hoodie',
      };
      const url = harness.adapter.buildPaymentUrl(request);
      expect(url.length).toBeGreaterThan(0);
      expect(harness.adapter.buildPaymentUrl(request)).toBe(url);
      expect(
        harness.adapter.buildPaymentUrl({
          ...request,
          reference: harness.adapter.generateReference(),
        }),
      ).not.toBe(url);
    });

    it('finds nothing for a reference no one has paid', async () => {
      await expect(
        harness.adapter.findPaymentsByReference({
          reference: harness.adapter.generateReference(),
          payoutAddress: harness.addresses.payout,
          token: 'USDC',
        }),
      ).resolves.toEqual([]);
    });

    it('finds a payment by reference and reports the actual amount and payer', async () => {
      const reference = harness.adapter.generateReference();
      const txSignature = await harness.submitPayment({
        reference,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
        amountTokenMinor: 25_000_000n,
        payerAddress: harness.addresses.payer,
      });

      const payments = await harness.adapter.findPaymentsByReference({
        reference,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
      });
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        txSignature,
        payerAddress: harness.addresses.payer,
        amountTokenMinor: 25_000_000n,
      });
      expect(payments[0]!.slot).toBeGreaterThanOrEqual(0n);
    });

    it('never returns a payment for a different reference (uniqueness)', async () => {
      const paid = harness.adapter.generateReference();
      await harness.submitPayment({
        reference: paid,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
        amountTokenMinor: 1_000_000n,
      });

      await expect(
        harness.adapter.findPaymentsByReference({
          reference: harness.adapter.generateReference(),
          payoutAddress: harness.addresses.payout,
          token: 'USDC',
        }),
      ).resolves.toEqual([]);
    });

    it('never matches the reference paid to a different recipient', async () => {
      const reference = harness.adapter.generateReference();
      await harness.submitPayment({
        reference,
        payoutAddress: harness.addresses.otherPayout,
        token: 'USDC',
        amountTokenMinor: 1_000_000n,
      });

      await expect(
        harness.adapter.findPaymentsByReference({
          reference,
          payoutAddress: harness.addresses.payout,
          token: 'USDC',
        }),
      ).resolves.toEqual([]);
    });

    it('never matches a payment in the wrong token', async () => {
      const reference = harness.adapter.generateReference();
      await harness.submitPayment({
        reference,
        payoutAddress: harness.addresses.payout,
        token: 'SOL',
        amountTokenMinor: 1_000_000n,
      });

      await expect(
        harness.adapter.findPaymentsByReference({
          reference,
          payoutAddress: harness.addresses.payout,
          token: 'USDC',
        }),
      ).resolves.toEqual([]);
    });

    it('reports under- and overpayments verbatim instead of filtering (rule 11)', async () => {
      const under = harness.adapter.generateReference();
      const over = harness.adapter.generateReference();
      await harness.submitPayment({
        reference: under,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
        amountTokenMinor: 1n,
      });
      await harness.submitPayment({
        reference: over,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
        amountTokenMinor: 999_999_999_999n,
      });

      const query = { payoutAddress: harness.addresses.payout, token: 'USDC' as const };
      const underpaid = await harness.adapter.findPaymentsByReference({ ...query, reference: under });
      const overpaid = await harness.adapter.findPaymentsByReference({ ...query, reference: over });
      expect(underpaid[0]?.amountTokenMinor).toBe(1n);
      expect(overpaid[0]?.amountTokenMinor).toBe(999_999_999_999n);
    });

    it('returns multiple payments to one reference oldest-first (FR-12)', async () => {
      const reference = harness.adapter.generateReference();
      const first = await harness.submitPayment({
        reference,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
        amountTokenMinor: 5_000_000n,
      });
      const second = await harness.submitPayment({
        reference,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
        amountTokenMinor: 5_000_000n,
      });

      const payments = await harness.adapter.findPaymentsByReference({
        reference,
        payoutAddress: harness.addresses.payout,
        token: 'USDC',
      });
      expect(payments.map((p) => p.txSignature)).toEqual([first, second]);
      expect(payments[0]!.slot <= payments[1]!.slot).toBe(true);
    });

    it('finality climbs the ladder and unknown signatures are DROPPED', async () => {
      const reference = harness.adapter.generateReference();
      const txSignature = await harness.submitPayment({
        reference,
        payoutAddress: harness.addresses.payout,
        token: 'SOL',
        amountTokenMinor: 1_000_000_000n,
      });

      await expect(harness.adapter.getFinality(txSignature)).resolves.toBe('PROCESSED');
      await harness.setFinality(txSignature, 'CONFIRMED');
      await expect(harness.adapter.getFinality(txSignature)).resolves.toBe('CONFIRMED');
      await harness.setFinality(txSignature, 'FINALIZED');
      await expect(harness.adapter.getFinality(txSignature)).resolves.toBe('FINALIZED');

      await expect(
        harness.adapter.getFinality('sig-that-never-existed'),
      ).resolves.toBe('DROPPED');
    });
  });
}
