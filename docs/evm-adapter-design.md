# EVM ChainAdapter — design

**Status: designed, deliberately not built** (PLAN.md). This document exists to
prove the `ChainAdapter` abstraction isn't Solana-shaped and to record the
design while the Solana implementation is fresh. Adding EVM must require zero
edits to intent, watcher, or webhook code — only a new adapter implementation
and its module registration (CLAUDE.md "O").

Target chains, in order: Ethereum Sepolia (testnet proof), then an L2
(Base or Arbitrum) where fees make small payments sane. Token: USDC first,
native ETH second.

## The contract to satisfy

Every `ChainAdapter` implementation must uphold the documented invariants,
verified by the shared adapter contract test suite (CLAUDE.md "L"):

1. **Reference uniqueness** — each intent maps to exactly one on-chain
   identifier a payment can be matched by, and a payment matches at most one
   intent.
2. **Finality semantics** — the adapter reports `DETECTED` → `CONFIRMED` →
   `FINALIZED` monotonically; `FINALIZED` is irreversible to the best of the
   chain's guarantees.
3. **Amount verification** — the adapter reports the received amount in token
   minor units as a bigint; classification (exact/under/over) stays in core
   code, never in the adapter.

## 1. Payment identification: HD deposit addresses

**Problem.** Solana Pay attaches a unique reference pubkey to the transfer,
so many payments can share one merchant wallet and still be told apart. EVM
has no memo equivalent: a plain ERC-20 `transfer(to, amount)` from any wallet
carries no attachable metadata.

**Design: one deposit address per intent, derived from a merchant xpub.**

- At merchant onboarding (EVM variant of wallet verification), the merchant
  provides an **xpub** (BIP-32 extended public key, e.g. account node
  `m/44'/60'/0'`) from their own wallet. The server stores the xpub only —
  watch-only; it can derive addresses but can never spend (non-custodial,
  CLAUDE.md rule 1).
- Intent creation derives the child address at the next unused index
  (`xpub/0/i`) and stores `(intentId, derivationIndex, address)`. The
  **address is the reference**: uniqueness invariant satisfied by never
  reusing an index.
- Funds land directly in addresses the merchant's seed controls. There is no
  sweep step on our side — consolidation is the merchant's business, in their
  wallet.

**Alternatives considered and rejected:**

| Approach | Why not |
| --- | --- |
| Calldata memo appended to transfer | Breaks with plain wallet UIs; most wallets can't attach calldata to an ERC-20 transfer |
| Amount fingerprinting (unique dust) | Ambiguous under concurrent intents; ugly UX; collides with under/overpayment states |
| Per-intent payment contract (CREATE2) | Deployment gas per intent; upgrades/custody questions; overkill for identification |
| Single address + first-come matching | Violates reference uniqueness; race-prone; silently mismatches concurrent payers |

**Caveats to document for merchants:** an xpub reveals the merchant's whole
address tree (privacy trade-off); index gap management needed if intents are
abandoned (bounded gap scan on reconciliation).

## 2. Amount verification

**USDC (ERC-20).** Watch `Transfer(address from, address to, uint256 value)`
logs on the canonical USDC contract (per-chain address from env config,
nothing hardcoded — CLAUDE.md rule 10 analog):

- `eth_getLogs` filtered by `topic0 = keccak(Transfer(address,address,uint256))`,
  `topic2 = deposit address`, contract = USDC.
- Amount = `value` (USDC has 6 decimals on all target chains — but read
  `decimals()` once at adapter startup and refuse to run on a mismatch).
- Sum multiple incoming transfers within the quote window; partial payments
  land in the same under/overpayment classification as Solana.

**Native ETH.** No logs for plain value transfers; also internal transactions
(from contracts/multisigs) don't appear as normal txs. Balance-delta approach:
compare `eth_getBalance(deposit, block)` across the watch window rather than
scanning txs — catches internal transfers too.

**Verification rule (mirrors Solana adapter):** recipient == derived deposit
address, token contract == configured mint equivalent, amount ≥ quoted minor
amount ⇒ report received amount; classification stays in core.

## 3. Confirmation / finality policy

Solana gives named commitment levels (`confirmed`, `finalized`). EVM
equivalents differ pre/post-merge and per L2:

- **Ethereum:** use block tags, not raw depth: first sight in a block ⇒
  `DETECTED`; included in a `safe` block ⇒ `CONFIRMED`; included in a
  `finalized` block ⇒ `FINALIZED` (~2 epochs ≈ 13 min). Depth-N is the
  fallback for RPCs without tag support (N=12 confirmed / N=32 finalized,
  env-configurable).
- **L2s (Base/Arbitrum):** sequencer inclusion is fast but soft. Policy
  decision needed: treat sequencer-confirmed as `CONFIRMED` and L1 batch
  finality as `FINALIZED` (slow but honest), or accept sequencer finality
  for devnet-grade guarantees. **TBD — decide when an L2 is targeted.**
- **Reorg handling:** `DETECTED`/`CONFIRMED` may regress on the chain but the
  intent state machine never moves backwards; the watcher simply re-verifies
  before each forward transition, and a payment that vanishes in a reorg
  before `FINALIZED` just stalls (then expires) rather than un-transitioning.

## 4. Watching

Same shape as Solana: BullMQ repeating job per `PENDING` intent, polling
JSON-RPC (`eth_getLogs` over the window since last checked block; balance
delta for ETH), exponential backoff on RPC errors, persisted cursor
(`lastScannedBlock`) so restarts are safe. 24h low-frequency tail watch after
expiry → `LATE_PAYMENT`. Poll interval per chain (12s blocks on L1 make 3s
polling pointless; env-configured).

## 5. Checkout instruction

Solana adapter emits a Solana Pay URL/QR. EVM adapter emits an
**EIP-681 payment URI** for the QR / deep link:

- ERC-20: `ethereum:<usdc-contract>@<chainId>/transfer?address=<deposit>&uint256=<amountMinor>`
- ETH: `ethereum:<deposit>@<chainId>?value=<amountWei>`

Wallet support for EIP-681 is patchier than Solana Pay — checkout page must
also render the raw address + exact amount with copy buttons as a fallback.

## 6. ChainAdapter interface mapping

| Interface method (working names) | Solana impl | EVM impl |
| --- | --- | --- |
| `createReference(intent)` | random reference pubkey | derive `xpub/0/i`, persist index |
| `buildPaymentInstruction(intent)` | Solana Pay URL + QR | EIP-681 URI + QR + fallback copy block |
| `findPayment(reference)` | Helius signatures-for-address(reference) | `eth_getLogs` on deposit addr / balance delta |
| `verifyPayment(candidate, intent)` | recipient ATA + mint + amount | deposit addr + token contract + amount |
| `finalityOf(payment)` | commitment status poll | block-tag / depth policy poll |

The interface must not leak chain concepts: no `slot`, no `blockNumber` in
core types — adapters translate to shared vocabulary (`detectedAt`,
`finalityLevel`, opaque `txRef` string).

## Open questions (resolve before building)

- [ ] Gas-price spikes vs. small payments: minimum viable intent amount per chain?
- [ ] xpub onboarding UX: which wallets export an xpub cleanly (hardware wallets do; MetaMask does not) — may need a documented derivation flow or an alternative for MetaMask-only merchants
- [ ] USDC on L2s: native vs bridged (USDC.e) contract addresses — config per chain, reject unknown contracts
- [ ] Index allocation under concurrent intent creation: DB sequence per merchant (unique constraint on `(merchantId, derivationIndex)`)
- [ ] L2 finality stance (see §3)
