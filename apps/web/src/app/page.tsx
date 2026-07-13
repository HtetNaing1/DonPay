import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ThemeToggle } from '@/components/atoms/theme-toggle';
import { Wordmark } from '@/components/atoms/wordmark';
import { IntentTicket } from '@/components/organisms/intent-ticket';
import { cn } from '@/lib/utils';

const cta =
  'inline-flex cursor-pointer items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

const HAPPY_PATH = ['CREATED', 'PENDING', 'DETECTED', 'CONFIRMED', 'FINALIZED'];

const EXCEPTIONS = [
  {
    name: 'EXPIRED',
    kind: 'state',
    copy: 'The quote lapsed with nothing detected. The link simply mints a fresh intent on the next open.',
  },
  {
    name: 'UNDERPAID',
    kind: 'state',
    copy: 'Terminal and explicit. The merchant is notified; the customer sees the exact shortfall and reference.',
  },
  {
    name: 'LATE_PAYMENT',
    kind: 'state',
    copy: 'Money arrived after expiry. Flagged for merchant action — funds that moved on-chain are never dropped.',
  },
  {
    name: 'OVERPAID',
    kind: 'flag',
    copy: 'Finalized, with the surplus recorded. The funds are yours; the books stay honest.',
  },
  {
    name: 'DUPLICATE_PAYMENT',
    kind: 'flag',
    copy: 'A second payment hit a completed one-time link. Both parties see it — nothing is silently swallowed.',
  },
];

const PILLARS = [
  {
    label: 'Identify',
    copy: 'Every checkout gets a unique reference key embedded in the transaction itself. Which payment, from whom, for what — answered on-chain, not guessed from amounts and timestamps.',
  },
  {
    label: 'Verify',
    copy: 'A chain watcher checks recipient, token, and amount against the locked quote, then follows the transfer to finality. Wrong amounts become explicit states, never silence.',
  },
  {
    label: 'Automate',
    copy: 'Every state change fires an HMAC-signed webhook with retries and a delivery log. Your order system reacts to finalized — no tab left open on a block explorer.',
  },
];

export default function Home() {
  return (
    <div className="bg-paper text-ink">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-6" aria-label="Main">
          <div className="hidden gap-6 text-sm text-ink-soft sm:flex">
            <a href="#how-it-works" className="transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#state-machine" className="transition-colors hover:text-ink">
              State machine
            </a>
            <a href="#developers" className="transition-colors hover:text-ink">
              Developers
            </a>
          </div>
          <ThemeToggle />
          <Link
            href="/dashboard"
            className={cn(cta, 'border border-hairline bg-surface px-4 py-2 hover:border-ink-soft')}
          >
            Open dashboard
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-14 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20 lg:pb-28">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-brand-deep uppercase">
            Non-custodial payments on Solana
          </p>
          <h1 className="mt-5 font-display text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
            A wallet address can receive money.{' '}
            <em className="text-brand-deep">It can&rsquo;t run payments.</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            DonPay wraps identification, verification, and automation around a direct
            buyer-to-merchant transfer. Payment links, hosted checkout, and signed webhooks — while
            the money moves straight to your wallet, never through ours.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className={cn(cta, 'bg-brand text-brand-foreground hover:bg-brand-deep')}
            >
              Start on devnet
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/docs"
              className={cn(cta, 'border border-hairline bg-surface hover:border-ink-soft')}
            >
              Read the API docs
            </Link>
          </div>
          <p className="mt-6 font-mono text-xs text-ink-soft">
            No pooled wallets. No withdrawals. No keys on our servers.
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <IntentTicket />
        </div>
      </section>

      {/* pillars */}
      <section id="how-it-works" className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <h2 className="max-w-2xl font-display text-4xl tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">
            What a bare address can&rsquo;t tell you
          </h2>
          <p className="mt-4 max-w-2xl text-ink-soft">
            &ldquo;Send 0.7 SOL to 7Qm3…jf9P&rdquo; moves money. It can&rsquo;t say which order was
            paid, whether the amount is right, or tell your systems to ship. DonPay adds the missing
            layer — in order, on every payment.
          </p>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article key={pillar.label} className="bg-paper p-7">
                <h3 className="font-mono text-xs tracking-[0.2em] text-brand-deep uppercase">
                  {pillar.label}
                </h3>
                <p className="mt-4 text-[15px] leading-relaxed text-ink">{pillar.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* state machine */}
      <section id="state-machine" className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <h2 className="max-w-2xl font-display text-4xl tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">
            Edge cases are states, <em className="text-brand-deep">not surprises</em>
          </h2>
          <p className="mt-4 max-w-2xl text-ink-soft">
            One state machine is the only thing allowed to move a payment forward. Every transition
            is row-locked, audited, and delivered to your webhook — including the uncomfortable
            ones.
          </p>

          <div
            className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[13px]"
            aria-label="Happy path"
          >
            {HAPPY_PATH.map((state, i) => (
              <span key={state} className="flex items-center gap-3">
                <span
                  className={cn(
                    'rounded-md border px-3 py-1.5',
                    i === HAPPY_PATH.length - 1
                      ? 'border-brand bg-brand text-brand-foreground'
                      : 'border-hairline bg-surface text-ink',
                  )}
                >
                  {state}
                </span>
                {i < HAPPY_PATH.length - 1 && (
                  <span className="text-ink-soft/60" aria-hidden="true">
                    →
                  </span>
                )}
              </span>
            ))}
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-5">
            {EXCEPTIONS.map((exception) => (
              <article key={exception.name} className="bg-surface p-5">
                <h3 className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[13px] text-ink">{exception.name}</span>
                  <span className="font-mono text-[10px] tracking-wider text-ink-soft/70 uppercase">
                    {exception.kind}
                  </span>
                </h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{exception.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* developers */}
      <section id="developers" className="border-t border-hairline bg-pine text-porcelain">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
          <div>
            <h2 className="font-display text-4xl tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">
              An API you can trust with money
            </h2>
            <ul className="mt-8 space-y-4 text-[15px] leading-relaxed text-porcelain/75">
              <li>
                <span className="font-mono text-[13px] text-porcelain">Idempotency-Key</span> on
                every mutation — retry a request, never a charge.
              </li>
              <li>
                <span className="font-mono text-[13px] text-porcelain">HMAC-signed webhooks</span>{' '}
                with exponential-backoff retries, a dead-letter queue, and one-click redelivery.
              </li>
              <li>
                <span className="font-mono text-[13px] text-porcelain">problem+json errors</span>{' '}
                with stable codes, documented in OpenAPI alongside every route.
              </li>
              <li>
                <span className="font-mono text-[13px] text-porcelain">TypeScript SDK</span> for the
                integration you&rsquo;ll actually write.
              </li>
            </ul>
            <Link
              href="/docs"
              className={cn(
                cta,
                'mt-9 border border-porcelain/25 text-porcelain hover:border-porcelain/60 focus-visible:outline-porcelain',
              )}
            >
              Browse the API reference
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="min-w-0 space-y-4">
            <figure className="overflow-hidden rounded-xl border border-porcelain/15 bg-black/30">
              <figcaption className="border-b border-porcelain/10 px-4 py-2 font-mono text-[11px] tracking-wider text-porcelain/50 uppercase">
                Create an intent
              </figcaption>
              <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-porcelain/90">
                {`curl https://api.donpay.dev/v1/payment-intents \\
  -H "Authorization: Bearer sk_test_9hK…" \\
  -H "Idempotency-Key: order_8412" \\
  -d '{
    "amountFiat": 18000,
    "fiatCurrency": "JPY",
    "token": "USDC"
  }'`}
              </pre>
            </figure>
            <figure className="overflow-hidden rounded-xl border border-porcelain/15 bg-black/30">
              <figcaption className="border-b border-porcelain/10 px-4 py-2 font-mono text-[11px] tracking-wider text-porcelain/50 uppercase">
                Receive the outcome
              </figcaption>
              <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-porcelain/90">
                {`POST /your/webhook            200 OK
X-DonPay-Signature: sha256=9f2c41…d8a0

{
  "event": "intent.finalized",
  "reference": "9vKtWq3xR7e2…AzG",
  "amountToken": "114503816",
  "txSignature": "5Uw…kQ2e"
}`}
              </pre>
            </figure>
          </div>
        </div>
      </section>

      {/* non-custodial */}
      <section className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <h2 className="max-w-3xl font-display text-4xl tracking-tight text-balance sm:text-[2.75rem] sm:leading-[1.1]">
            Your customer pays <em className="text-brand-deep">you</em>. We never sit in the middle.
          </h2>
          <div className="mt-12 grid items-stretch gap-4 font-mono text-[13px] sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-xl border border-hairline bg-paper p-6">
              <p className="text-xs tracking-[0.2em] text-ink-soft uppercase">Buyer wallet</p>
              <p className="mt-2 text-ink">HxR4…u2Wd</p>
            </div>
            <div className="flex items-center justify-center px-2 text-ink-soft">
              <span className="hidden sm:inline" aria-hidden="true">
                ──── direct transfer ────▶
              </span>
              <span className="sm:hidden" aria-hidden="true">
                ▼ direct transfer
              </span>
            </div>
            <div className="rounded-xl border border-brand/40 bg-brand/5 p-6">
              <p className="text-xs tracking-[0.2em] text-brand-deep uppercase">
                Merchant wallet — yours
              </p>
              <p className="mt-2 text-ink">7Qm3…jf9P</p>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            DonPay stands beside the transfer, not inside it: it identifies the payment, verifies it
            on-chain, and notifies your systems. The server signs nothing but webhooks and auth
            nonces — there are no user funds or private keys to lose, freeze, or regulate.
          </p>
        </div>
      </section>

      {/* closing CTA */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center lg:py-24">
          <h2 className="font-display text-4xl tracking-tight text-balance sm:text-5xl">
            Get paid on devnet <em className="text-brand-deep">in five minutes</em>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">
            Sign up, verify a payout wallet, create a link, and watch the states flow — with a
            devnet wallet and zero real funds.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/signup"
              className={cn(cta, 'bg-brand text-brand-foreground hover:bg-brand-deep')}
            >
              Start on devnet
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <Wordmark className="text-xl" />
          <p className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">
            Devnet demo — no real funds
          </p>
          <nav className="flex gap-5 text-sm text-ink-soft" aria-label="Footer">
            <Link href="/docs" className="transition-colors hover:text-ink">
              Docs
            </Link>
            <a
              href="https://github.com"
              className="transition-colors hover:text-ink"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
