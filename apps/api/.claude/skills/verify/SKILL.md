---
name: verify
description: Build, launch, and drive the DonPay API against the dev Neon DB to verify changes end-to-end.
---

# Verifying the DonPay API

## Launch

```bash
pnpm build                      # from repo root; runs prisma generate + nest build
cd apps/api && pnpm start       # serves on http://localhost:4000 (PORT in apps/api/.env)
curl http://localhost:4000/health   # {"status":"ok"} when up
```

`.env` points at the shared Neon dev DB and live CoinGecko — both reachable, no local services needed.

## Getting authenticated handles

```bash
# session token (dashboard surface):
curl -s -X POST :4000/auth/signup -d '{"email":"verify-<x>@test.dev","password":"...12+ chars...","name":"..."}'
# → .accessToken  (Bearer for /merchants/me/* and /auth/me)

# API key (developer surface, /v1/*):
curl -s -X POST :4000/merchants/me/api-keys -H "authorization: Bearer $TOKEN" -d '{"label":"verify"}'
# → .key (sk_..., shown once)
```

Wallet verification needs a real ed25519 signature; for verification runs insert one directly instead:

```bash
echo "INSERT INTO \"WalletAddress\" (id, \"merchantId\", address, chain, \"verifiedAt\", \"isDefault\")
VALUES ('w_verify_1', '<merchantId>', 'So11111111111111111111111111111111111111112', 'SOLANA', now(), true);" \
  | pnpm prisma db execute --stdin
```

## Gotchas

- Use `verify-*@test.dev` emails and clean up after:
  `DELETE FROM "IdempotencyRecord" WHERE "merchantId" IN (SELECT id FROM "Merchant" WHERE email LIKE 'verify-%@test.dev'); DELETE FROM "Merchant" WHERE email LIKE 'verify-%@test.dev';`
  (IdempotencyRecord has no FK — the Merchant cascade does not remove it.)
- curl silently drops a header whose value is only whitespace — probe empty headers with `-H 'Header-Name;'`.
- Errors are RFC 7807 problem+json; match on `.code`, not `.detail`.
- Stop the server with `pkill -f "node.*dist/main"`.
