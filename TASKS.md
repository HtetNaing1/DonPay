# TASKS.md — DonPay

Living checklist. One or two tasks per session, top to bottom. Check off in the same commit as the work. Split oversized tasks here before starting. Spec lives in PLAN.md; rules in CLAUDE.md — don't relitigate either here.

**Session ritual:** read CLAUDE.md → PLAN.md section if needed → next unchecked task → build → `pnpm build` + tests pass → check off → commit.

---

## Week 0 — Design prep (½–1 day)

- [ ] Walk through the full flow manually once: create a devnet wallet (Phantom), airdrop SOL, send a devnet USDC transfer, inspect it in explorer + via Helius API — know the raw material before abstracting it
- [x] Write `docs/evm-adapter-design.md` skeleton (deposit-address derivation, confirmation policy, ERC-20 log parsing) — capture the design while it's fresh
- [ ] Wireframes: checkout page, dashboard payments list, link creation form, onboarding stepper

## Week 1 — Foundation, auth, links

- [x] Monorepo: pnpm workspaces, `apps/api` (NestJS), `apps/web` (Next.js + Tailwind + shadcn init), `packages/shared`; ESLint/Prettier/Vitest; CI running build + tests
- [x] Prisma schema from PLAN.md; Neon DB; first migration; seed script (1 merchant, sample links)
- [x] Shared Zod schemas + money utils (integer minor units) in `packages/shared` with unit tests
- [x] Nest skeleton: domain modules, config module (env-validated), pino logging, problem+json error filter
- [x] Auth: signup/login (argon2, Auth.js on web side), session guard; onboarding stepper shell in web
- [x] Nonce infrastructure: `AuthNonce` issue/verify/burn, structured message format, ed25519 verification — one implementation, two consumers
- [x] Wallet payout verification flow (wallet adapter in web + verify endpoint); multiple wallets, default flag
- [x] Wallet login (SIWS-style) as Auth.js credentials provider using the nonce infra
- [x] API keys: generate (`sk_` prefix, hashed, shown once), revoke, ApiKeyGuard with constant-time compare
- [x] RateSource interface + CoinGecko implementation + cached quotes; QuoteService with 10-min lock
- [x] PaymentLink CRUD (API + dashboard form with QR download); slug generation; status logic (paused/expired/completed)
- [x] PaymentIntent creation: from API (with Idempotency-Key) and from link-open; reference generation; quote embedding

## Week 2 — Checkout, chain watcher, state machine

- [x] State machine: pure transition function with exhaustive unit tests (every state × every event), then transactional `transition()` with row locking + IntentTransition audit rows
- [x] ChainAdapter interface + adapter contract test suite (runs against any implementation)
- [x] SolanaAdapter: build Solana Pay URL/QR, find-by-reference via Helius, verify recipient/mint/amount, commitment polling
- [x] Watcher: BullMQ repeating job per PENDING intent (3s poll, backoff on RPC errors, persisted — restart-safe); stop conditions; 24h low-frequency tail watch after expiry → LATE_PAYMENT
- [x] Under/overpayment handling per PLAN.md states; DUPLICATE_PAYMENT flag on completed one-time links
- [x] Hosted checkout page: server-rendered intent data, QR + wallet deep link, expiry countdown, live status via WS gateway
- [ ] `/pay/[slug]`: link → (amount input if PAYER_CHOOSES) → intent → redirect to checkout
- [ ] **Concurrency test:** N parallel workers hammer one intent with conflicting events → exactly one winning transition path, zero double-writes
- [ ] **One-time link race test:** two simultaneous payments → first finalized wins, second flagged DUPLICATE_PAYMENT

## Week 3 — Webhooks, dashboard, docs, ship

- [ ] `/v1/payment-links` API-key surface: reuse LinksService + IdempotencyService (rule 5) behind ApiKeyGuard
- [ ] Outbox: WebhookDelivery rows written in transition transaction; dispatcher worker with HMAC signing, 5 retries exponential backoff, dead-letter status
- [ ] Webhook endpoint CRUD + delivery log UI + manual redeliver button
- [ ] Dashboard: payments list (filter by status/link) + detail with state timeline and explorer links
- [ ] Dashboard: reconciliation view (DB vs chain per merchant, daily)
- [ ] Devnet banner on every surface; landing page with the "why not just a wallet address" pitch

### Testing & QA

- [ ] e2e (supertest): intent lifecycle happy path against a mocked ChainAdapter
- [ ] **IDOR suite:** merchant B attempts every read/write on merchant A's resources → all 404/403
- [ ] Idempotency test: same key twice → one execution, identical response
- [ ] Adapter contract suite green against SolanaAdapter
- [ ] Manual devnet run-through: fresh wallet → signup → verify → link → pay → webhook received (use webhook.site) — time it; must be < 5 min
- [ ] Mobile pass on checkout at 375px; Lighthouse on checkout ≥ 90

### Release

- [ ] Deploy: Railway (api + worker + Redis), Vercel (web), Neon prod branch; env config per environment
- [ ] OpenAPI published at `/docs`; quickstart guide; webhook integration guide with signature-verification sample code
- [ ] TS SDK in `packages/shared` polished; jewellery-store demo instance checks out via a payment link using it
- [ ] README (EN + JP summary): architecture diagram, state machine diagram, positioning story, test evidence (concurrency/IDOR results), EVM design doc linked
- [ ] Demo video/GIF: QR scan → live status flow → webhook log

## Done

(move checked sections here as weeks complete)
