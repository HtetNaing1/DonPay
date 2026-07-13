import 'next-auth';

declare module 'next-auth' {
  interface User {
    apiAccessToken: string;
    apiTokenExpiresAt: string;
  }

  interface Session {
    merchantId: string;
    /** Bearer token for calls to the NestJS API on behalf of this merchant. */
    apiAccessToken: string;
  }
}
