import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const SEED_MERCHANT_EMAIL = 'demo@donpay.dev';
const SEED_MERCHANT_PASSWORD = 'donpay-demo-password';

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { email: SEED_MERCHANT_EMAIL },
    update: {},
    create: {
      email: SEED_MERCHANT_EMAIL,
      passwordHash: await argon2.hash(SEED_MERCHANT_PASSWORD),
      name: 'Demo Jewellery Store',
    },
  });

  const links = [
    {
      slug: 'demo-silver-ring',
      type: 'ONE_TIME',
      amountMode: 'FIXED',
      fiatCurrency: 'USD',
      amountFiat: 5000, // $50.00 in cents
      token: 'USDC',
      note: 'Silver ring — one-off invoice',
      maxUses: 1,
    },
    {
      slug: 'demo-gold-pendant',
      type: 'REUSABLE',
      amountMode: 'FIXED',
      fiatCurrency: 'JPY',
      amountFiat: 18000, // ¥18,000 (JPY has no minor unit)
      token: 'USDC',
      note: 'Gold pendant — catalogue item',
    },
    {
      slug: 'demo-tip-jar',
      type: 'REUSABLE',
      amountMode: 'PAYER_CHOOSES',
      fiatCurrency: 'USD',
      minFiat: 100, // $1.00
      maxFiat: 50000, // $500.00
      token: 'SOL',
      note: 'Tip jar — payer chooses the amount',
    },
  ] as const;

  for (const link of links) {
    await prisma.paymentLink.upsert({
      where: { slug: link.slug },
      update: {},
      create: { ...link, merchantId: merchant.id },
    });
  }

  console.log(
    `Seeded merchant ${merchant.email} (login: ${SEED_MERCHANT_PASSWORD}) with ${links.length} links`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
