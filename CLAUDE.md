# CLAUDE.md — DonPay

Multi-tenant, **non-custodial** crypto payment gateway on Solana (devnet v1). Merchants sign up, verify a payout wallet, create payment links (one-time or reusable) or call the API; customers pay via a hosted checkout (Solana Pay QR); a chain watcher verifies payment and fires signed webhooks. Funds always move buyer → merchant wallet directly; we only identify, verify, and automate.

Read PLAN.md for the spec and TASKS.md for the current task list before starting work.

## Monorepo (pnpm workspaces)

- `apps/api` — NestJS: REST API, WS gateway, BullMQ workers (worker runs as a second entry point of the same codebase)
- `apps/web` — Next.js: merchant dashboard + hosted checkout. **Deliberately thin** — no business logic, no Next API routes; every mutation calls the NestJS API like any external client
- `packages/shared` — Zod schemas, types, the small TS SDK used by demo integrations

## Stack

NestJS + TypeScript · BullMQ + Redis (Upstash) · PostgreSQL (Neon) + Prisma · @solana/web3.js + @solana/pay + Helius RPC (devnet) · Next.js + Tailwind + shadcn/ui · Auth.js (dashboard sessions) · CoinGecko (rates) · OpenAPI via Nest decorators · Deploy: Railway (api/worker/redis), Vercel (web)

## Commands

- `pnpm dev` — all apps · `pnpm build` — must pass before any task is done
- `pnpm test` / `pnpm test:e2e` — unit / API e2e
- `pnpm --filter api prisma migrate dev` — schema changes

## SOLID — enforced concretely, not as slogans

- **S — one reason to change per service.** `QuoteService` (rates/locking), `PaymentIntentService` (lifecycle), `ChainWatcherService` (detection), `WebhookDispatcher` (delivery), `LinkService` (links) are separate providers. If a service description needs the word "and", split it.
- **O — new chains are new adapters.** Adding EVM must require zero edits to intent, watcher, or webhook code — only a new `ChainAdapter` implementation and its module registration.
- **L — adapters honor the contract.** Every `ChainAdapter` implementation must satisfy the documented invariants (reference uniqueness, finality semantics, amount verification) — the shared adapter contract test suite runs against each implementation.
- **I — narrow interfaces.** `ChainAdapter`, `RateSource`, `Clock` are separate small interfaces. Nothing depends on methods it doesn't call.
- **D — depend on abstractions.** Services inject interface tokens (`CHAIN_ADAPTER`, `RATE_SOURCE`), never concrete `SolanaAdapter`/`CoinGeckoRateSource`. Concretions are bound in modules only. Tests inject fakes.

## Frontend structure — Atomic Design

- `components/ui/` — shadcn/ui primitives (copied in; treated as the atom layer, edit freely)
- `components/atoms/` — project atoms not covered by shadcn: AmountDisplay, StatusDot, CopyButton, QrCode
- `components/molecules/` — PaymentLinkCard, IntentStatusTimeline, WebhookDeliveryRow, WalletBadge, ApiKeyRow
- `components/organisms/` — LinkForm, LinksTable, CheckoutPanel, WebhookLogTable, OnboardingSteps, WalletConnectPanel
- Templates = `layout.tsx`; Pages = `page.tsx`

Rules: imports flow downward only; atoms/molecules presentational (props in, JSX out); data fetching in organisms/pages; forms use react-hook-form + Zod schemas imported from `packages/shared` (same schemas the API validates with); check for an existing component before adding one.

## Rules — never violate

1. **Non-custodial, always.** No code path ever holds, forwards, or signs with user funds or private keys. The server signs nothing but webhooks and auth nonces.
2. **State machine is the only writer of intent status.** All transitions go through `PaymentIntentService.transition()` — a pure, exhaustively tested transition function + a DB transaction with row locking (`SELECT ... FOR UPDATE`). No direct `UPDATE payment_intents SET status` anywhere else.
3. **Webhooks use the outbox pattern.** State transitions write a `WebhookDelivery` row in the same transaction; the worker delivers asynchronously (HMAC-signed, 5 retries with exponential backoff, then dead-letter). Never send webhooks inline.
4. **Every query is merchant-scoped.** Repository methods take `merchantId` as a required parameter; cross-tenant access must be structurally impossible, not just checked in controllers.
5. **Idempotency:** API mutations accept an `Idempotency-Key` header; same key + same merchant returns the stored response, never re-executes.
6. **Rates lock at intent creation** (checkout open), never at link creation. Quotes carry the rate, source, and locked-until timestamp; expired quotes require a new intent.
7. **Amounts are integers** in minor units (lamports / USDC micro-units / JPY as-is). No floats in money math, ever. Conversions live in `packages/shared/money.ts`.
8. **Nonces are single-use, expiring, domain-bound.** Wallet verification and wallet login sign a structured message (domain, address, nonce, timestamp); the server burns the nonce on use.
9. **API keys are stored hashed** (like passwords); shown once at creation. Dashboard auth (session) and API auth (key) are separate guards — no route accepts both.
10. **Devnet only:** every user-facing surface shows the "Devnet demo — no real funds" banner. RPC endpoints/cluster come from env config; nothing hardcodes mainnet.
11. **Underpayment/overpayment are explicit states with defined behavior**, never silently ignored (see PLAN.md).
12. **The web app must stay replaceable.** If a change requires the API to know it's being called by our own frontend, the design is wrong.

## Conventions

- TS strict; no `any` without a justifying comment
- NestJS: one module per domain (auth, merchants, links, intents, chain, webhooks, rates); DTOs validated via Zod pipes from shared schemas
- Errors: RFC 7807 problem+json responses with stable error codes (documented in OpenAPI)
- Structured logging (pino) with merchantId/intentId correlation fields
- Commit style `feat:`/`fix:`/`chore:`; check off TASKS.md in the same commit as the work
