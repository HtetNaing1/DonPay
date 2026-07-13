import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ERROR_CODES } from '../common/problem/error-codes';
import { ProblemException } from '../common/problem/problem.exception';
import { Merchant } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionRequest extends Request {
  merchant?: Merchant;
}

/**
 * Dashboard session guard: verifies the `Authorization: Bearer <jwt>` session
 * token and attaches the merchant to the request. API-key auth (`sk_...`) is
 * a separate guard — no route accepts both (CLAUDE.md rule 9).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const token = extractBearerToken(request);
    if (!token) {
      throw this.unauthorized('Missing session token');
    }

    let payload: { sub?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
    } catch {
      throw this.unauthorized('Invalid or expired session');
    }
    if (!payload.sub) {
      throw this.unauthorized('Invalid or expired session');
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: payload.sub },
    });
    if (!merchant) {
      throw this.unauthorized('Invalid or expired session');
    }

    request.merchant = merchant;
    return true;
  }

  private unauthorized(detail: string): ProblemException {
    return new ProblemException(401, ERROR_CODES.UNAUTHORIZED, detail);
  }
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : undefined;
}
