import { STATUS_CODES } from 'http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { DEFAULT_CODE_BY_STATUS, ERROR_CODES, ErrorCode } from './error-codes';
import { ProblemException } from './problem.exception';

/** RFC 7807 body; `code` is our stable machine-readable extension member. */
interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: ErrorCode;
  [extension: string]: unknown;
}

/** Global filter: every error leaves the API as `application/problem+json`. */
@Catch()
@Injectable()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ProblemFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const problem = this.toProblem(exception);
    if (problem.status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json({ ...problem, instance: request.url });
  }

  private toProblem(exception: unknown): ProblemBody {
    if (exception instanceof ProblemException) {
      const status = exception.getStatus();
      return {
        ...exception.extensions,
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail: exception.message,
        code: exception.code,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail: extractDetail(exception),
        code: DEFAULT_CODE_BY_STATUS[status] ?? ERROR_CODES.INTERNAL_ERROR,
      };
    }

    return {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      // Never leak internals of unexpected errors to clients
      detail: 'An unexpected error occurred',
      code: ERROR_CODES.INTERNAL_ERROR,
    };
  }
}

function extractDetail(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: string | string[] }).message;
  return Array.isArray(message)
    ? message.join('; ')
    : (message ?? exception.message);
}
