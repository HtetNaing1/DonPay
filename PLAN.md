# PLAN.md — DonPay

A multi-tenant, non-custodial payment gateway on Solana: the infrastructure layer that turns "here's my wallet address" into real payment processing — identified, amount-verified, automated, and integrable. Backend-flagship portfolio project following the SDLC. Timeline: **3 weeks** (tasks in TASKS.md). Devnet only in v1.

**Positioning (README leads with this):** a bare wallet address moves money but can't tell you which payment came from whom, for what, or whether the amount is right — and nothing reacts automatically. DonPay adds identification (reference keys), verification (amount/token/finality), and automation (state machine + webhooks) _around_ a direct buyer→merchant transfer, without ever taking custody.

---

## Phase 1 — Requirements

### Users

- **Merchants:** sign up self-serve, verify a payout wallet, create payment links or integrate the API, watch payments arrive, receive webhooks
- **Customers:** open a checkout link/QR, pay from their wallet, see live confirmation
- **Developers (API consumers):** Stripe-quality DX — clear docs, idempotency, predictable errors, signed webhooks

### Functional requirements

- FR-1: Merchant signup (email+password); onboarding = verify payout wallet → create first link
- FR-2: Wallet payout verification via signed nonce (Phantom / wallet adapter); multiple wallets per merchant
- FR-3: **Wallet login** as a second door (SIWS-style): nonce challenge → signed structured message → session for the merchant owning that verified wallet. Email remains the root identity
- FR-4: API keys per merchant (hashed, shown once, revocable); dashboard session auth and API key auth as separate guards
- FR-5: **Payment links:** type ONE_TIME | REUSABLE; amountMode FIXED | PAYER_CHOOSES (min/max); optional expiresAt, maxUses; status ACTIVE/PAUSED/COMPLETED/EXPIRED; QR + shareable URL
- FR-6: `POST /v1/payment-intents` API (and link-open flow) creates an intent: quote in SOL or USDC from fiat amount, rate locked 10 min, unique reference key, hosted checkout URL
- FR-7: Hosted checkout: Solana Pay QR + wallet deep link, live status via websocket (pending → detected → confirmed → finalized), expiry countdown
- FR-8: Chain watcher detects the reference on-chain, verifies recipient/token/amount, advances the state machine to finality or an exception state
- FR-9: Under/overpayment become explicit intent states with defined behavior (below), surfaced to merchant and customer
- FR-10: Signed webhooks (HMAC) on every state transition; retries with exponential backoff → dead-letter; delivery log in dashboard with redeliver button
- FR-11: Dashboard: payments list + detail (state timeline, tx link to explorer), links CRUD, webhook endpoints + logs, API keys, wallet management
- FR-12: One-time link race: concurrent payers — first finalized payment wins; late/duplicate payment is detected, flagged `DUPLICATE_PAYMENT`, and shown to both parties (funds moved on-chain; never silently swallow)
- FR-13: Daily reconciliation view: DB state vs chain state per merchant
- FR-14: OpenAPI docs + quickstart + webhook integration guide; demo: jewellery-store demo instance checks out via a payment link (SDK from packages/shared)

### Non-functional requirements

- NFR-1: State machine transitions are exactly-once under concurrency (row locking; proven by a concurrency test hammering one intent)
- NFR-2: Idempotent mutations via Idempotency-Key
- NFR-3: No floats in money paths; integer minor units end-to-end
- NFR-4: Watcher survives restarts (jobs persisted in Redis; no in-memory-only state)
- NFR-5: Cross-tenant isolation structurally enforced (merchant-scoped repositories); covered by e2e tests attempting IDOR
- NFR-6: Devnet-only guardrails; "no real funds" banner on all surfaces
- NFR-7: p95 checkout page load < 2s on mobile (server-rendered)

### Out of scope (v1)

Mainnet, refunds (designed, documented, not built), EVM chains (adapter designed, not built), multi-user teams, fiat settlement/off-ramp, email notifications, plugin SDKs beyond the TS one.

---

## Phase 2 — Design

### Architecture decisions (do not relitigate)

- **Non-custodial:** buyer pays merchant's wallet directly; server never touches funds/keys. Kills custody risk, regulatory surface, and most security nightmares. The gateway's value is identification + verification + automation.
- **NestJS over Express:** the project needs DI, guards for two auth schemes, queue + WS integration, generated OpenAPI. Express would mean hand-rolling all of it. (Bonus: Nest ≈ Spring architecture — Japan-relevant.)
- **Standalone API + thin Next.js web app** (dashboard + checkout). No business logic in the frontend; it must remain replaceable by any other client.
- **ChainAdapter abstraction (OCP/DIP):** Solana is the only v1 implementation. `docs/evm-adapter-design.md` records the EVM design (HD-wallet deposit addresses from merchant xpub since EVM lacks memo-based references, confirmation-depth policy, ERC-20 Transfer log parsing) — designed, deliberately not built.
- **Polling watcher over chain websockets** in v1: restart-safe, rate-limit-friendly, simpler to reason about. Trade-off documented; websocket subscription is a listed optimization.
- **Outbox pattern for webhooks:** delivery row written in the same DB transaction as the state change; worker delivers async. Never inline.
- **Rate lock at intent creation, never link creation** (reusable links may be paid months later).
- **SOLID enforced via the concrete rules in CLAUDE.md** (service boundaries, adapter contract tests, interface tokens).
- **Frontend: Tailwind + shadcn/ui within Atomic structure** (shadcn = atom layer, owned code).

### PaymentIntent state machine (the heart)

```
CREATED ──► PENDING ──► DETECTED ──► CONFIRMED ──► FINALIZED
   │           │            │
   │           ▼            ▼
   └──────► EXPIRED     UNDERPAID (terminal, merchant notified,
               │         customer sees shortfall + reference)
               ▼
        LATE_PAYMENT (payment detected after expiry —
                      flagged for merchant action, never dropped)
OVERPAID = FINALIZED + overpayment flag (funds are merchant's; surplus noted)
DUPLICATE_PAYMENT flag = second payment on a completed one-time link/intent
```

- Transitions only via `PaymentIntentService.transition(intentId, event)`: pure decision function (exhaustively unit-tested) + transactional application with `SELECT ... FOR UPDATE`
- Every transition: audit row + outbox webhook row + WS push, same transaction

### Payment links

`PaymentLink` is configuration; opening one spawns a `PaymentIntent` (own reference, own quote). ONE_TIME = maxUses 1. PAYER_CHOOSES renders an amount input (min/max) before intent creation. Link status auto-moves to COMPLETED (one-time, paid) / EXPIRED.

### Chain watching (Solana adapter)

On PENDING: BullMQ repeating job (every 3s, backoff-aware) queries Helius for signatures involving the reference key → on hit, fetch tx, verify (recipient ATA, mint, amount ≥ expected) → DETECTED → poll commitment status → CONFIRMED (confirmed) → FINALIZED (finalized) → job stops. On quote expiry without detection → EXPIRED (job keeps a low-frequency tail watch for LATE_PAYMENT for 24h).

### Auth design

- Root identity: email+password (Auth.js credentials, argon2)
- Wallet verify & wallet login share the nonce infrastructure: `GET /auth/nonce` → sign structured message `{domain, address, nonce, issuedAt}` → ed25519 verify (tweetnacl) → burn nonce
- Dashboard: session cookie guard. API: `Authorization: Bearer sk_...` key guard (constant-time hash compare). Separate guards, no route accepts both

### Data model (Prisma, core)

```prisma
model Merchant { id, email @unique, passwordHash, name, createdAt,
  wallets WalletAddress[], apiKeys ApiKey[], links PaymentLink[],
  intents PaymentIntent[], webhookEndpoints WebhookEndpoint[] }

model WalletAddress { id, merchantId, address @unique, chain, verifiedAt, isDefault }

model ApiKey { id, merchantId, keyHash, prefix, label, createdAt, revokedAt? }

model PaymentLink { id, merchantId, slug @unique, type,          // ONE_TIME | REUSABLE
  amountMode,                                                    // FIXED | PAYER_CHOOSES
  fiatCurrency, amountFiat?, minFiat?, maxFiat?, token,          // SOL | USDC
  note?, expiresAt?, maxUses?, useCount, status, createdAt }

model PaymentIntent { id, merchantId, linkId?, reference @unique,
  fiatCurrency, amountFiat, token, amountToken BigInt, rateLocked Decimal,
  rateSource, quoteExpiresAt, payoutAddress, status, flags String[],
  idempotencyKey?, createdAt, updatedAt,
  payments OnchainPayment[], transitions IntentTransition[] }

model OnchainPayment { id, intentId, txSignature @unique, slot BigInt,
  amountToken BigInt, payerAddress, detectedAt, finalizedAt? }

model IntentTransition { id, intentId, fromStatus, toStatus, event, createdAt } // audit

model WebhookEndpoint { id, merchantId, url, secret, active, events String[] }

model WebhookDelivery { id, endpointId, intentId, event, payload Json,
  status,        // PENDING | DELIVERED | FAILED | DEAD
  attempts, nextAttemptAt?, lastResponseCode?, createdAt }

model AuthNonce { id, address, nonce @unique, purpose, expiresAt, usedAt? }
model IdempotencyRecord { key, merchantId, responseHash, response Json, createdAt @@id([key, merchantId]) }
```

### API surface (v1)

`POST /v1/payment-intents` · `GET /v1/payment-intents/:id` · `POST/GET/PATCH /v1/payment-links` · `GET /v1/payments` · webhook endpoint CRUD · plus auth/nonce/session routes and the public checkout read endpoint. All documented in OpenAPI with stable problem+json error codes.

### Pages (apps/web)

Public: `/pay/[slug]` (link → checkout) · `/checkout/[intentId]` (QR, live status, countdown) · landing page with devnet banner.
Dashboard: onboarding stepper · payments list/detail (state timeline, explorer links) · links CRUD + QR download · webhooks (endpoints, delivery log, redeliver) · API keys · wallets · settings.

---

## Phases 3–5 — Implementation, Testing, Release

Task detail in TASKS.md. Week 1: monorepo, schema, auth (incl. wallet verify/login), links + intents + quotes. Week 2: checkout + Solana adapter + watcher + state machine hardening. Week 3: webhooks, dashboard completion, docs, tests (incl. concurrency + IDOR + adapter contract), deploy, demo integration.

**Definition of done:** a stranger with a devnet wallet can sign up, create a link, and get paid — watching states flow live — in under 5 minutes; concurrency test shows zero double-transitions; README documents the architecture, the state machine, and the "why not just a wallet address" story (EN + JP summary).

## Phase 6 — Backlog

EVM adapter (per design doc) · refunds flow · mainnet hardening checklist · chain websocket subscriptions · email notifications · teams/roles · plugin for the jewellery store's production checkout · hosted invoice PDFs.
