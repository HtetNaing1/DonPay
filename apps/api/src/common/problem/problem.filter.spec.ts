import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from './error-codes';
import { ProblemException } from './problem.exception';
import { ProblemFilter } from './problem.filter';

function makeHost() {
  const response = {
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/v1/payment-links/abc' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

function makeFilter() {
  const logger = {
    setContext: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
  return { filter: new ProblemFilter(logger), logger };
}

describe('ProblemFilter', () => {
  it('renders a ProblemException with its code and extensions', () => {
    const { filter } = makeFilter();
    const { host, response } = makeHost();

    filter.catch(
      new ProblemException(
        400,
        ERROR_CODES.VALIDATION_FAILED,
        'Request validation failed',
        {
          errors: [{ path: 'amountFiat', message: 'Required' }],
        },
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.type).toHaveBeenCalledWith('application/problem+json');
    expect(response.json).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Request validation failed',
      code: 'validation_failed',
      errors: [{ path: 'amountFiat', message: 'Required' }],
      instance: '/v1/payment-links/abc',
    });
  });

  it('maps plain HttpExceptions to default codes per status', () => {
    const { filter } = makeFilter();
    const { host, response } = makeHost();

    filter.catch(new NotFoundException('Link not found'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'not_found',
        detail: 'Link not found',
        status: 404,
      }),
    );
  });

  it('hides details of unexpected errors and logs them', () => {
    const { filter, logger } = makeFilter();
    const { host, response } = makeHost();

    filter.catch(new Error('secret internal detail'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'internal_error',
        detail: 'An unexpected error occurred',
      }),
    );
    const body = (response.json as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
    expect(logger.error).toHaveBeenCalled();
  });
});
