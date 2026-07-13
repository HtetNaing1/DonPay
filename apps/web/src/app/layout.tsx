import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';
import { DevnetBanner } from '@/components/atoms/devnet-banner';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

/* Type system — "porcelain ledger":
   Bricolage carries the voice in headings, Schibsted does the quiet UI work,
   Plex Mono is the ledger itself (amounts, states, addresses). */
const displayFont = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const bodyFont = Schibsted_Grotesk({
  variable: '--font-schibsted',
  subsets: ['latin'],
});

const monoFont = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'DonPay — Payment processing for Solana, without custody',
  description:
    'DonPay wraps identification, verification, and automation around a direct buyer-to-merchant transfer on Solana. Non-custodial payment links, hosted checkout, and signed webhooks. Devnet demo.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} antialiased`}
      >
        <ThemeProvider>
          <DevnetBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
