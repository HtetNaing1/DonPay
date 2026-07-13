/** Base URL of the NestJS API. The web app is just another API client. */
export function apiUrl(path: string): string {
  const base = process.env.API_URL ?? 'http://localhost:4000';
  return `${base}${path}`;
}

/** RFC 7807 problem+json body returned by the API on every error. */
export interface Problem {
  title: string;
  status: number;
  detail: string;
  code: string;
}

export async function readProblem(response: Response): Promise<Problem> {
  try {
    return (await response.json()) as Problem;
  } catch {
    return {
      title: 'Error',
      status: response.status,
      detail: 'The API returned an unexpected response',
      code: 'internal_error',
    };
  }
}
