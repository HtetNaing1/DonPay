# Backend walkthrough — the Webhooks module

A learning-oriented tour of one complete vertical slice of the DonPay backend:
the webhooks module. If you read this alongside the inline comments in
`apps/api/src/webhooks/*` and `apps/api/src/worker/webhook.worker.ts`, you'll
see how a NestJS feature is wired end to end — HTTP → service → database → a
background worker that does real network I/O.

Everything here is a real, running feature. Nothing is pseudocode.

---

## 1. What a webhook is, and the one guarantee we care about

A merchant registers a URL. Whenever one of their payments changes state
(`intent.finalized`, `intent.underpaid`, …), DonPay sends an HTTP `POST` to that
URL with a signed JSON body. That's it — it's how a merchant's order system
learns "this payment is settled" without polling us.

The hard part isn't sending the POST. It's this guarantee:

> A webhook must fire **if and only if** the state change actually committed —
> never for a change that rolled back, and never dropped for one that didn't.

Getting that right drives the whole design (it's **rule 3** in `CLAUDE.md`).

---

## 2. Two processes, one codebase

The same code boots in two roles (see `CLAUDE.md` → Monorepo):

- **API process** — serves HTTP. Handles endpoint CRUD, and — during a payment
  state change — *records the intent to send* a webhook.
- **Worker process** — no HTTP server. Runs a timer that *actually sends* the
  webhooks and handles retries.

They never call each other directly. They communicate **through the database**.
That decoupling is the "outbox pattern."

---

## 3. The data model (two tables)

```
WebhookEndpoint            WebhookDelivery
-----------------          -------------------------------------
id                         id
merchantId  ── owns ──►     endpointId  ─── belongs to endpoint
url                        intentId
secret   (shown once)      event
active                     payload      (frozen JSON snapshot)
events[] (subscriptions)   status       PENDING | DELIVERED | FAILED | DEAD
                           attempts
                           nextAttemptAt
                           lastResponseCode
```

The `WebhookDelivery` row **is the queue**. There's no separate message broker
for delivery state — Postgres holds it, which is why a worker restart loses
nothing. The status field is the state machine for a single delivery:

- `PENDING`  — queued, waiting for the next sweep.
- `DELIVERED` — got a 2xx. Terminal.
- `FAILED`   — a send failed but retries remain; `nextAttemptAt` is in the future.
- `DEAD`     — retries exhausted (dead-lettered). Terminal unless a human redelivers.

---

## 4. Flow A — managing endpoints (a normal HTTP request)

Files: `webhooks.controller.ts` → `webhook-endpoints.service.ts`

This is the "boring CRUD" flow, and it's the best place to learn the NestJS
request pipeline. Take `POST /merchants/me/webhooks`:

1. **Routing** — `@Controller('merchants/me/webhooks')` + `@Post()` map the URL
   to the `create` handler.
2. **Guard** — `@UseGuards(SessionGuard)` runs first. It validates the dashboard
   session and attaches the current merchant to the request (or throws 401).
   This is the *session* door; the `sk_` API-key door is a different guard, and
   no route accepts both (**rule 9**).
3. **Validation pipe** — `@Body(new ZodValidationPipe(createWebhookEndpointSchema))`
   runs the JSON body through a Zod schema *before* the handler. Bad input →
   400 problem+json. The schema is shared with the frontend, so the form and the
   API validate identically.
4. **Handler** — thin. It reads the merchant from `@CurrentMerchant()` and calls
   the service. Controllers do plumbing; services do logic (**rule S**).
5. **Service** — `WebhookEndpointsService.create` generates the signing secret,
   inserts the row, and returns it **with** the secret — the only response that
   ever includes it. Every other method maps through `toView()`, which omits the
   secret by construction.

### The merchant-scoping trick (worth internalizing)

Look at `update()`. It uses `updateMany` for what is logically a single row:

```ts
await tx.webhookEndpoint.updateMany({
  where: { id: endpointId, merchantId },   // ← both, always
  data: { ...only fields the caller sent },
});
if (updated.count === 0) throw notFound(); // wrong id OR wrong owner → 404
```

`update({ where: { id } })` needs a *unique* filter and so **can't** include
`merchantId` — it would update by id alone and leak across tenants. `updateMany`
lets us filter on both, so a wrong-merchant id simply matches zero rows. This is
**rule 4** made structural: cross-tenant access isn't "checked," it's impossible
to express. The same idea appears as a relation filter in `redeliver`
(`where: { id, endpoint: { merchantId } }`) and a two-step ownership check in
`deliveries`.

---

## 5. Flow B — a state change writes the outbox (the important one)

File: `webhook-outbox.service.ts` (called from `payment-intent.service.ts`)

When a payment advances, `PaymentIntentService.transition()` runs inside a
database transaction. In that *same* transaction it calls:

```ts
await this.webhookOutbox.enqueue(tx, { merchantId, intentId, event, intent });
```

The critical detail: `enqueue` takes **`tx`**, the open transaction — not the
normal client. So the delivery rows it inserts commit or roll back **together
with** the status change. That's the whole outbox pattern:

- If the transaction commits → the status change is true **and** the delivery
  rows exist. The webhook will go out.
- If it rolls back → neither the status change nor the delivery rows exist. No
  phantom webhook for a change that didn't happen.

Inside `enqueue`:

1. Find this merchant's `active` endpoints subscribed to this event
   (`events` empty = "everything", else `has: event`).
2. Freeze a **payload snapshot** — what was true at transition time. A webhook
   delivered minutes later (after retries) still describes the intent as it was
   *then*, not its current state.
3. `createMany` one `PENDING` row per endpoint (fan-out), `nextAttemptAt = now`
   so it's immediately due.

Notice the API process **never sends anything here.** It only records intent.
Sending is someone else's job — which keeps the request fast and the send
retryable.

---

## 6. Flow C — the worker delivers

Files: `webhook.worker.ts` → `webhook-dispatcher.service.ts`

### The loop (`webhook.worker.ts`)

`onModuleInit` (a NestJS lifecycle hook that runs once the app is ready) starts a
`setInterval` that calls `sweep()` every `WEBHOOK_POLL_MS`. `sweep()` has an
**overlap guard** (`if (this.sweeping) return`) so a slow sweep never stacks a
second one on top of itself, and it swallows-and-logs errors so one bad tick
can't kill the timer. `onApplicationShutdown` clears the timer for a clean exit.

### One sweep (`dispatcher.tick()`)

Query the due work: rows that are `PENDING`/`FAILED` **and** `nextAttemptAt <=
now`, oldest first, `take: 20`. `DELIVERED`/`DEAD` are terminal and ignored. The
`[status, nextAttemptAt]` index exists exactly for this query. Capping at 20 per
sweep means a backlog drains over several sweeps instead of one huge burst.

### One delivery (`dispatcher.deliver()`)

1. **Claim it optimistically.** Before sending, bump `attempts` *conditionally*:

   ```ts
   updateMany({ where: { id, attempts: delivery.attempts },
                data: { attempts: { increment: 1 } } });
   if (claimed.count === 0) return; // someone else already took this attempt
   ```

   If two workers grab the same row, the DB serializes the two updates: the
   first flips `attempts 0→1` and matches; the second's `where attempts = 0`
   now matches nothing, so it bails. The row's own value is the lock — no
   explicit locking needed. This is why the counter is bumped *before* the HTTP
   call, not after.

2. **Sign and POST.** `signWebhook(secret, timestamp, body)` (see §8) produces
   the `donpay-signature` header. We also send `donpay-event` and a stable
   `donpay-delivery` id so receivers can **dedupe** (a retry after a timeout that
   actually succeeded may arrive twice). `AbortSignal.timeout` bounds a hung
   receiver.

3. **Record the outcome.**
   - Success (2xx) → `status: DELIVERED`, `nextAttemptAt: null`. Done.
   - Failure → decide retry vs give up:
     ```ts
     const dead = attempt >= maxAttempts;
     status:        dead ? 'DEAD' : 'FAILED'
     nextAttemptAt: dead ? null   : now + backoffBaseMs * 4**(attempt-1)
     ```
     **Exponential backoff**: `base * 4^(attempt-1)` → 30s, 2m, 8m, 32m … Each
     retry waits 4× longer, so a down endpoint is probed rarely, not hammered.
     After `WEBHOOK_MAX_ATTEMPTS` the row is **dead-lettered** (`DEAD`, no next
     attempt) and the dispatcher ignores it forever.

---

## 7. Redeliver (a human override)

`POST .../deliveries/:deliveryId/redeliver` → `WebhookEndpointsService.redeliver`.
It just flips a finished delivery back to `PENDING` with `nextAttemptAt = now`.
It does **not** reset `attempts`, so a `DEAD` row that fails again goes straight
back to `DEAD` — redelivery is "one more try," not a fresh retry cycle. A
`PENDING` row is already queued, so re-queuing it returns `409 Conflict`. Note
again: the dashboard never sends anything itself; it nudges a DB row and the
worker does the work.

---

## 8. Signing & verification (`signature.ts`)

```
donpay-signature: t=<unix>,v1=<hex>
v1 = HMAC-SHA256(secret, `${t}.${rawBody}`)
```

- **HMAC** proves the body wasn't tampered with *and* that the sender knows the
  shared secret — both at once.
- We sign `timestamp.body`, not just the body, so the timestamp is covered by
  the MAC. `verifyWebhookSignature` rejects timestamps outside a tolerance
  window, which stops an attacker from **replaying** a captured delivery later.
- Comparison uses `timingSafeEqual` (constant-time), not `===`. A normal compare
  short-circuits on the first differing byte, leaking — via timing — how many
  leading bytes matched, which can let an attacker forge a MAC byte by byte.

`verifyWebhookSignature` is also the reference implementation shipped in the
integration guide, so merchants verify exactly the way we sign.

---

## 9. Patterns to carry to the rest of the codebase

These recur everywhere in `apps/api`, not just here:

- **DI by token** — modules bind interfaces to implementations
  (`{ provide: CLOCK, useClass: SystemClock }`). Code depends on the token, tests
  inject fakes. (**rule D**)
- **Merchant scoping in the query** — every repository read/write takes
  `merchantId` and filters on it, so cross-tenant access is structurally
  impossible. (**rule 4**)
- **Outbox** — side effects (webhooks) are written as rows in the same
  transaction as the state change, then performed asynchronously. Never inline.
  (**rule 3**)
- **Thin controllers, focused services** — controllers parse/guard/validate;
  services hold logic; one service has one reason to change. (**rules S, I**)
- **Map DB rows to view types at the boundary** — the view type omits secrets by
  construction, so leaks are impossible rather than merely avoided.

---

## 10. Try it yourself

- **Read order:** `webhooks.module.ts` (wiring) → `webhooks.controller.ts`
  (HTTP) → `webhook-endpoints.service.ts` (CRUD) → `webhook-outbox.service.ts`
  (write side) → `webhook-dispatcher.service.ts` + `worker/webhook.worker.ts`
  (send side) → `signature.ts`.
- **See the guarantee:** in `payment-intent.service.ts`, find the
  `webhookOutbox.enqueue(tx, …)` call inside `transition()` and confirm it uses
  the transaction `tx`, not `this.prisma`.
- **Watch a delivery move** through `PENDING → DELIVERED` (point an endpoint at
  https://webhook.site) or `PENDING → FAILED → … → DEAD` (point it at a URL that
  returns 500) using the dashboard's delivery log.
- **Find the tests:** `*.spec.ts` next to each service — `signature.spec.ts` is a
  compact, readable place to start.
