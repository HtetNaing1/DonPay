import { createPaymentIntentSchema } from '@donpay/shared';
import { describe, expect, it } from 'vitest';
import { ProblemException } from '../problem/problem.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createPaymentIntentSchema);

  it('returns the parsed value for valid input', () => {
    const value = pipe.transform({
      fiatCurrency: 'USD',
      amountFiat: 1999,
      token: 'USDC',
    });
    expect(value).toEqual({
      fiatCurrency: 'USD',
      amountFiat: 1999,
      token: 'USDC',
    });
  });

  it('throws a 400 ProblemException with per-field issues for invalid input', () => {
    try {
      pipe.transform({ fiatCurrency: 'USD', amountFiat: 19.99, token: 'DOGE' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const problem = error as ProblemException;
      expect(problem).toBeInstanceOf(ProblemException);
      expect(problem.getStatus()).toBe(400);
      expect(problem.code).toBe('validation_failed');
      const paths = (problem.extensions.errors as { path: string }[]).map(
        (e) => e.path,
      );
      expect(paths).toContain('amountFiat');
      expect(paths).toContain('token');
    }
  });
});
