import type { Metadata } from 'next';
import type { MerchantWallet } from '@donpay/shared';
import { WalletBadge } from '@/components/molecules/wallet-badge';
import { WalletConnectPanel } from '@/components/organisms/wallet-connect-panel';
import { merchantApiFetch } from '@/lib/api-server';
import { setDefaultWallet } from './actions';

export const metadata: Metadata = {
  title: 'Wallets — DonPay',
};

export default async function WalletsPage() {
  const result = await merchantApiFetch<MerchantWallet[]>('/merchants/me/wallets');
  const wallets = result.ok ? result.data : [];

  return (
    <div className="space-y-8">
      <div className="rise-in">
        <h1 className="font-display text-3xl tracking-tight">Payout wallets</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Payments settle directly to these addresses — DonPay never takes custody.
        </p>
      </div>

      <div className="rise-in" style={{ '--rise-order': 1 } as React.CSSProperties}>
        <WalletConnectPanel />
      </div>

      <section
        aria-labelledby="wallets-heading"
        className="rise-in"
        style={{ '--rise-order': 2 } as React.CSSProperties}
      >
        <h2 id="wallets-heading" className="font-display text-lg tracking-tight">
          Verified wallets
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-surface">
          {wallets.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-mono text-[13px] text-ink-soft">No wallets yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft/80">
                Verify your first wallet above — new payment links will settle to your default
                address.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {wallets.map((wallet) => (
                <li key={wallet.id}>
                  <WalletBadge
                    address={wallet.address}
                    verifiedAt={wallet.verifiedAt}
                    isDefault={wallet.isDefault}
                    action={
                      !wallet.isDefault && (
                        <form action={setDefaultWallet.bind(null, wallet.id)}>
                          <button
                            type="submit"
                            className="h-9 shrink-0 cursor-pointer rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-brand/40 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          >
                            Make default
                          </button>
                        </form>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
