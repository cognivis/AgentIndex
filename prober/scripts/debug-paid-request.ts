import { config } from 'dotenv';
config({ path: new URL('../.env', import.meta.url).pathname });

import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { PrivateKey } from '@hiero-ledger/sdk';

const decode = (v: string | null) => {
  if (!v) return null;
  try { return JSON.parse(Buffer.from(v, 'base64').toString('utf8')); } catch { return v; }
};

let hop = 0;
const loggingFetch: typeof fetch = async (input, init) => {
  const req = new Request(input as RequestInfo, init);
  hop++;
  console.log(`\n--- hop ${hop}: ${req.method} ${req.url}`);
  console.log('    has PAYMENT-SIGNATURE:', req.headers.has('PAYMENT-SIGNATURE'), '| has X-PAYMENT:', req.headers.has('X-PAYMENT'));
  const res = await globalThis.fetch(req);
  console.log('    -> status', res.status);
  console.log('    -> PAYMENT-REQUIRED:', JSON.stringify(decode(res.headers.get('payment-required')))?.slice(0, 500));
  console.log('    -> PAYMENT-RESPONSE:', JSON.stringify(decode(res.headers.get('payment-response') ?? res.headers.get('x-payment-response'))));
  return res;
};

const signer = createClientHederaSigner(
  process.env.HEDERA_ACCOUNT_ID!,
  PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY!),
  { network: 'hedera:testnet' },
);
const client = new x402Client()
  .register('hedera:testnet', new ExactHederaScheme(signer))
  .setSpendControls({
    allowedAssets: [{ network: 'hedera:testnet', asset: '0.0.0', maxAmountPerPayment: '100000000' }],
  });
const paidFetch = wrapFetchWithPayment(loggingFetch, client);

try {
  const res = await paidFetch('http://localhost:4021/weatherpro/current?city=singapore');
  console.log('\nFINAL:', res.status, (await res.text()).slice(0, 300));
} catch (err) {
  console.error('\nTHREW:', err instanceof Error ? err.message : err);
}
