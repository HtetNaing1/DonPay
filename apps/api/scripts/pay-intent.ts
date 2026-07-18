/**
 * Dev utility: pay a DonPay intent on devnet from the CLI, the way a wallet
 * would from the checkout QR — a SystemProgram transfer to the payout
 * address with the intent's reference attached as a read-only account key
 * (that's what makes the payment findable by the chain watcher).
 *
 * Usage:
 *   DONPAY_SK=sk_... pnpm exec tsx scripts/pay-intent.ts <intentId> [--lamports N]
 *
 * --lamports overrides the paid amount, to exercise UNDERPAID / OVERPAID.
 * First run mints a local payer keypair (scripts/.devnet-payer.json,
 * gitignored) — fund it at https://faucet.solana.com and rerun.
 * SOL intents only; devnet USDC needs a token account + faucet USDC.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const API = process.env.DONPAY_API ?? 'http://localhost:4000';
const KEYPAIR_PATH = join(__dirname, '.devnet-payer.json');

async function main() {
  const [intentId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const lamportsFlag = process.argv.indexOf('--lamports');
  const override = lamportsFlag > -1 ? process.argv[lamportsFlag + 1] : null;
  const apiKey = process.env.DONPAY_SK;
  if (!intentId || !apiKey) {
    console.error(
      'Usage: DONPAY_SK=sk_... pnpm exec tsx scripts/pay-intent.ts <intentId> [--lamports N]',
    );
    process.exit(1);
  }

  let payer: Keypair;
  if (existsSync(KEYPAIR_PATH)) {
    payer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, 'utf8'))),
    );
  } else {
    payer = Keypair.generate();
    writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(payer.secretKey)));
    console.log(`minted payer keypair → ${KEYPAIR_PATH}`);
  }
  console.log('payer:', payer.publicKey.toBase58());

  const connection = new Connection(RPC, 'confirmed');
  const balance = await connection.getBalance(payer.publicKey);
  console.log('payer balance:', balance / 1e9, 'SOL');
  if (balance < 10_000_000) {
    console.error(
      `\nNot enough devnet SOL. Fund the payer at https://faucet.solana.com\n→ ${payer.publicKey.toBase58()}\nthen rerun.`,
    );
    process.exit(1);
  }

  const response = await fetch(`${API}/v1/payment-intents/${intentId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    console.error(`GET intent failed: HTTP ${response.status}`, await response.text());
    process.exit(1);
  }
  const intent = (await response.json()) as {
    token: string;
    amountToken: string;
    payoutAddress: string;
    reference: string;
    status: string;
  };
  if (intent.token !== 'SOL') {
    console.error(
      `Intent is ${intent.token} — this script only pays SOL intents (devnet USDC needs a funded token account).`,
    );
    process.exit(1);
  }
  const lamports = Number(override ?? intent.amountToken);
  console.log(
    `paying ${lamports} lamports (quoted ${intent.amountToken}) → ${intent.payoutAddress}`,
  );
  console.log('reference:', intent.reference);

  const transfer = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey(intent.payoutAddress),
    lamports,
  });
  // the Solana Pay trick: the reference rides along as a read-only key
  transfer.keys.push({
    pubkey: new PublicKey(intent.reference),
    isSigner: false,
    isWritable: false,
  });

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(transfer),
    [payer],
  );
  console.log('\npaid! signature:', signature);
  console.log(`explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log(`\nnow watch it: curl -s ${API}/v1/payment-intents/${intentId} -H "authorization: Bearer $DONPAY_SK"`);
}

void main();
