// The demo: an agent that checks AgentIndex before spending money.
//
// 1. asks the AgentIndex MCP to resolve a task
// 2. explains what the index told it (including who to avoid, and why)
// 3. pays the recommended service for real over x402 on Hedera
// 4. shows the data and the payment receipt
//
// Run:  pnpm start  (services must be up; .env must have Hedera creds)
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { PrivateKey } from '@hiero-ledger/sdk';

const TASK = process.argv[2] ?? 'get current weather for singapore';

const say = (s: string) => console.log(s);
const step = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

step(`task: "${TASK}"`);

// -- 1. ask the index ---------------------------------------------------
step('consulting agentindex over MCP...');

// spawn tsx directly — package-manager banners on stdout would corrupt the protocol
const root = resolve(import.meta.dirname, '../..');
const transport = new StdioClientTransport({
  command: resolve(root, 'mcp/node_modules/.bin/tsx'),
  args: [resolve(root, 'mcp/src/index.ts')],
  cwd: root,
});
const mcp = new Client({ name: 'demo-agent', version: '0.1.0' });
await mcp.connect(transport);

const result = await mcp.callTool({ name: 'resolve_data_need', arguments: { task: TASK } });
const answer = JSON.parse(
  (result.content as { type: string; text: string }[])[0].text,
);

if (!answer.payThis) {
  say('index found no trustworthy service for this task. refusing to spend.');
  process.exit(0);
}

for (const bad of answer.avoid ?? []) {
  say(`  ✕ avoiding ${bad.name} (${bad.price}/call): ${bad.reasons.join('; ')}`);
}
const pick = answer.payThis;
say(`  ✓ selected ${pick.name} (${pick.price}/call): ${pick.reasons.join('; ')}`);
say(
  `  index data: block ${answer._meta.indexedBlock}, ${answer._meta.ageSeconds}s old, deployment ${answer._meta.subgraphDeployment.slice(0, 12)}...`,
);

// -- 2. pay the winner over x402 ---------------------------------------
step(`paying ${pick.label} via x402 on hedera testnet...`);

const signer = createClientHederaSigner(
  process.env.HEDERA_ACCOUNT_ID!,
  PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY!),
  { network: 'hedera:testnet' },
);
const payer = new x402Client()
  .register('hedera:testnet', new ExactHederaScheme(signer))
  .setSpendControls({
    allowedAssets: [{ network: 'hedera:testnet', asset: '0.0.0', maxAmountPerPayment: '100000000' }],
  });
const paidFetch = wrapFetchWithPayment(globalThis.fetch, payer);

const url = pick.method === 'GET' ? `${pick.endpoint}?city=singapore` : pick.endpoint;
const res = await paidFetch(url, { method: pick.method });
const receiptHeader = res.headers.get('payment-response') ?? res.headers.get('x-payment-response');
const receipt = receiptHeader
  ? JSON.parse(Buffer.from(receiptHeader, 'base64').toString('utf8'))
  : null;

// -- 3. the goods -------------------------------------------------------
step('response:');
console.log(JSON.stringify(await res.json(), null, 2));

step('receipt:');
say(`  paid:    ${pick.price} to ${pick.name}`);
say(`  hedera:  ${receipt?.transaction ?? 'n/a'}`);
say(`  https://hashscan.io/testnet/transaction/${receipt?.transaction ?? ''}`);

say('\nno scam, no wasted money — trust from receipts, not reviews.');
await mcp.close();
process.exit(0);
