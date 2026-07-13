import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Domain exception carrying a stable error code plus optional RFC 7807
 * extension members (e.g. `errors` for validation issue lists).
 */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    detail: string,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail, status);
  }
}
