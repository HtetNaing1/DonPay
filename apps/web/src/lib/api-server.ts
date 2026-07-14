import { auth } from '@/auth';
import { apiUrl, Problem, readProblem } from '@/lib/api';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: Problem };

/**
 * Server-side call to the NestJS API on behalf of the signed-in merchant.
 * The bearer token lives only in the Auth.js JWT — it never reaches the
 * browser; client components go through server actions that use this.
 */
export async function merchantApiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const session = await auth();
  if (!session?.apiAccessToken) {
    return {
      ok: false,
      problem: {
        title: 'Unauthorized',
        status: 401,
        detail: 'Your session has expired. Sign in again.',
        code: 'unauthorized',
      },
    };
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.apiAccessToken}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    return { ok: false, problem: await readProblem(response) };
  }
  return { ok: true, data: (await response.json()) as T };
}
