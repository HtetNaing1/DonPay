import { z } from 'zod';

/**
 * Environment contract — the app refuses to boot on invalid config.
 * Chain/Redis/rate-source variables join here as their modules are built.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** HS256 secret for dashboard session JWTs — generate with `openssl rand -hex 32`. */
  AUTH_JWT_SECRET: z
    .string()
    .min(32, 'AUTH_JWT_SECRET must be at least 32 characters'),
  AUTH_SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  /** Domain bound into wallet sign messages — must match what the web app renders. */
  AUTH_DOMAIN: z.string().min(1).default('localhost:3000'),
  AUTH_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  COINGECKO_URL: z.url().default('https://api.coingecko.com/api/v3'),
  /** Demo-tier key (x-cg-demo-api-key); optional — anonymous calls work at low volume. */
  COINGECKO_API_KEY: z.string().optional(),
  RATE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  /** How long an intent's locked rate stays valid (PLAN.md FR-6: 10 minutes). */
  QUOTE_LOCK_SECONDS: z.coerce.number().int().positive().default(600),
  /** Public origin of the web app — intents embed `${WEB_BASE_URL}/checkout/:id`. */
  WEB_BASE_URL: z.url().default('http://localhost:3000'),
  /** Solana JSON-RPC endpoint (Helius devnet in deploys) — rule 10: cluster comes from env, never code. */
  SOLANA_RPC_URL: z.url().default('https://api.devnet.solana.com'),
  /** SPL mint accepted as USDC; default is Circle's devnet USDC. */
  USDC_MINT: z.string().min(32).default('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
