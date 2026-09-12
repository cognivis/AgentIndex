// Register every seeded service as a subname of agentindex.eth on ENSv2
// Sepolia and publish its manifest (endpoint, price, spec) as text records.
// Re-runnable: skips names that are already registered.
import { config } from 'dotenv';
config({
  path: process.env.AGENTINDEX_ENV_FILE ?? new URL('../../.env', import.meta.url).pathname,
});

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  namehash,
  parseAbi,
  toBytes,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { services } from '../src/catalog.js';

const registrarAbi = parseAbi([
  'function register(string label, address owner, address resolver, uint64 duration) returns (uint256)',
  'function available(string label) view returns (bool)',
]);

const registryAbi = parseAbi([
  'function setResolver(uint256 anyId, address resolver)',
  'function getResolver(string label) view returns (address)',
]);

const resolverAbi = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function text(bytes32 node, string key) view returns (string)',
]);

const REGISTRAR = process.env.SUBNAME_REGISTRAR_ADDRESS as Address;
const REGISTRY = process.env.AGENTINDEX_REGISTRY_ADDRESS as Address;
// our PermissionedResolver proxy — PublicResolverV2 can't authorize v2-native names
const RESOLVER = process.env.AGENTINDEX_RESOLVER as Address;
const BASE_URL = process.env.PUBLIC_SERVICES_URL ?? 'http://localhost:4021';
const YEAR = 365n * 24n * 3600n;

if (!REGISTRAR || !RESOLVER) throw new Error('SUBNAME_REGISTRAR_ADDRESS and PUBLIC_RESOLVER_V2 required');

const account = privateKeyToAccount(
  `0x${process.env.DEPLOYER_PRIVATE_KEY!.replace(/^0x/, '')}`,
);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });

for (const svc of services) {
  const name = `${svc.label}.agentindex.eth`;
  const node = namehash(name);

  const available = await client.readContract({
    address: REGISTRAR,
    abi: registrarAbi,
    functionName: 'available',
    args: [svc.label],
  });

  if (available) {
    const hash = await wallet.writeContract({
      address: REGISTRAR,
      abi: registrarAbi,
      functionName: 'register',
      args: [svc.label, account.address, RESOLVER, YEAR],
    });
    await client.waitForTransactionReceipt({ hash });
    console.log(`registered ${name}  (${hash.slice(0, 14)})`);
  } else {
    console.log(`${name} already registered`);
    // heal earlier runs that pointed at the wrong resolver
    const labelId = BigInt(keccak256(toBytes(svc.label)));
    const current = await client.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: 'getResolver',
      args: [svc.label],
    });
    if (current.toLowerCase() !== RESOLVER.toLowerCase()) {
      const hash = await wallet.writeContract({
        address: REGISTRY,
        abi: registryAbi,
        functionName: 'setResolver',
        args: [labelId, RESOLVER],
      });
      await client.waitForTransactionReceipt({ hash });
      console.log(`  resolver fixed -> ${RESOLVER}`);
    }
  }

  const records: Record<string, string> = {
    url: `${BASE_URL}${svc.path}`,
    description: svc.description,
    'x402:method': svc.method,
    'x402:price': svc.priceUsd,
    'x402:spec': JSON.stringify(svc.spec),
  };

  for (const [key, value] of Object.entries(records)) {
    const current = await client.readContract({
      address: RESOLVER,
      abi: resolverAbi,
      functionName: 'text',
      args: [node, key],
    });
    if (current === value) continue;
    const hash = await wallet.writeContract({
      address: RESOLVER,
      abi: resolverAbi,
      functionName: 'setText',
      args: [node, key, value],
    });
    await client.waitForTransactionReceipt({ hash });
    console.log(`  ${key} = ${value}`);
  }
}

console.log('\nall services registered under agentindex.eth');
