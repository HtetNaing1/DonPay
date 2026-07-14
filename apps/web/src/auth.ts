import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { apiUrl, readProblem } from '@/lib/api';

/** Carries the API's stable problem code (`conflict`, `unauthorized`, …) to the form. */
class ApiSignin extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

interface ApiSession {
  accessToken: string;
  expiresAt: string;
  merchant: { id: string; email: string; name: string };
}

/** Shared by both providers: turn the API session into an Auth.js user. */
function toAuthUser(session: ApiSession) {
  return {
    id: session.merchant.id,
    email: session.merchant.email,
    name: session.merchant.name,
    apiAccessToken: session.accessToken,
    apiTokenExpiresAt: session.expiresAt,
  };
}

/**
 * Auth.js holds the browser session; the NestJS API stays the only
 * authority on credentials. `authorize` forwards signup/login to the API and
 * stores the returned API token in the Auth.js JWT.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted (Railway/localhost): the Host header is set by our own proxy/server
  trustHost: true,
  // Session lifetime matches the API token's 7-day TTL so the browser session
  // never outlives the bearer token it carries
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        mode: {},
        email: {},
        password: {},
        name: {},
      },
      async authorize(credentials) {
        const mode = credentials.mode === 'signup' ? 'signup' : 'login';
        const body =
          mode === 'signup'
            ? {
                email: credentials.email,
                password: credentials.password,
                name: credentials.name,
              }
            : { email: credentials.email, password: credentials.password };

        const response = await fetch(apiUrl(`/auth/${mode}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const problem = await readProblem(response);
          throw new ApiSignin(problem.code);
        }

        const session = (await response.json()) as ApiSession;
        return toAuthUser(session);
      },
    }),
    /**
     * SIWS-style wallet login (second door — email stays the root identity).
     * The panel signs the nonce message client-side; this just forwards the
     * signed payload to the API, which verifies and burns the nonce.
     */
    Credentials({
      id: 'wallet',
      credentials: {
        message: {},
        signature: {},
      },
      async authorize(credentials) {
        let message: unknown;
        try {
          message = JSON.parse(credentials.message as string);
        } catch {
          throw new ApiSignin('validation_failed');
        }

        const response = await fetch(apiUrl('/auth/wallet-login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, signature: credentials.signature }),
        });
        if (!response.ok) {
          const problem = await readProblem(response);
          throw new ApiSignin(problem.code);
        }

        const session = (await response.json()) as ApiSession;
        return toAuthUser(session);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.merchantId = user.id;
        token.apiAccessToken = user.apiAccessToken;
        token.apiTokenExpiresAt = user.apiTokenExpiresAt;
      }
      return token;
    },
    session({ session, token }) {
      session.merchantId = token.merchantId as string;
      session.apiAccessToken = token.apiAccessToken as string;
      return session;
    },
  },
});
