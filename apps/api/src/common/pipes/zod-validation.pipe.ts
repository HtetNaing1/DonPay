import { PipeTransform } from '@nestjs/common';
import { z, ZodType } from 'zod';
import { ERROR_CODES } from '../problem/error-codes';
import { ProblemException } from '../problem/problem.exception';

/**
 * Validates a request part against a shared Zod schema (packages/shared —
 * the same schemas the web forms use). Usage:
 *
 *   @Body(new ZodValidationPipe(createPaymentLinkSchema)) body: CreatePaymentLinkInput
 */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ProblemException(
        400,
        ERROR_CODES.VALIDATION_FAILED,
        'Request validation failed',
        {
          errors: result.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        },
      );
    }
    return result.data;
  }
}
