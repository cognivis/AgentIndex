// Revoke a service's subname — the enforcement arm of the index.
//   pnpm exec tsx scripts/delist.ts scamco "12% delivery, 0% spec honesty across 60+ paid probes"
// Re-listing later: rerun register-services.ts (names are re-registerable once revoked).
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });

import { createPublicClient, createWalletClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const [label, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(' ');
if (!label || !reason) {
  console.error('usage: tsx scripts/delist.ts <label> <reason>');
  process.exit(1);
}

const registrarAbi = parseAbi([
  'function delist(string label, string reason)',
  'function available(string label) view returns (bool)',
]);

const REGISTRAR = process.env.SUBNAME_REGISTRAR_ADDRESS as Address;
const account = privateKeyToAccount(`0x${process.env.DEPLOYER_PRIVATE_KEY!.replace(/^0x/, '')}`);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });

console.log(`delisting ${label}.agentindex.eth`);
console.log(`reason: ${reason}`);

const hash = await wallet.writeContract({
  address: REGISTRAR,
  abi: registrarAbi,
  functionName: 'delist',
  args: [label, reason],
});
await client.waitForTransactionReceipt({ hash });

const gone = await client.readContract({
  address: REGISTRAR,
  abi: registrarAbi,
  functionName: 'available',
  args: [label],
});

console.log(`revoked on-chain: https://sepolia.etherscan.io/tx/${hash}`);
console.log(`name available again: ${gone}`);
console.log('the subgraph marks it delisted, the prober drops it next round, and the MCP tells agents to avoid it.');
