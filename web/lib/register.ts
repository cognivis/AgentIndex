// Demo-wallet service registration: signs the ENS subname registration and
// writes the manifest text records from our funded deployer key, so a service
// can be listed live on stage without anyone needing a wallet. Mirrors
// services/scripts/register-services.ts, scoped to a single service.
import { loadRootEnv } from './env';
loadRootEnv();
import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  parseAbi,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const registrarAbi = parseAbi([
  'function register(string label, address owner, address resolver, uint64 duration) returns (uint256)',
  'function available(string label) view returns (bool)',
]);
const resolverAbi = parseAbi(['function setText(bytes32 node, string key, string value)']);

const YEAR = 365n * 24n * 3600n;
const etherscan = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;

export interface RegisterInput {
  label: string;
  url: string;
  method: string;
  price: string;
  description: string;
  requiredFields: string[];
}

export interface RegisterTx {
  step: string;
  hash: string;
  url: string;
}

export class RegisterError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function validate(input: RegisterInput) {
  if (!/^[a-z0-9]{3,30}$/.test(input.label)) {
    throw new RegisterError('label must be 3–30 lowercase letters/digits', 400);
  }
  for (const [k, v] of [
    ['url', input.url],
    ['price', input.price],
    ['description', input.description],
  ] as const) {
    if (!v || !v.trim()) throw new RegisterError(`${k} is required`, 400);
  }
  if (input.method !== 'GET' && input.method !== 'POST') {
    throw new RegisterError('method must be GET or POST', 400);
  }
}

export async function registerService(input: RegisterInput): Promise<{
  label: string;
  ensName: string;
  txs: RegisterTx[];
}> {
  validate(input);

  const rpc = process.env.SEPOLIA_RPC_URL;
  const registrar = process.env.SUBNAME_REGISTRAR_ADDRESS as Address | undefined;
  const resolver = process.env.AGENTINDEX_RESOLVER as Address | undefined;
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpc || !registrar || !resolver || !rawKey) {
    throw new RegisterError('registration is not configured on this host', 500);
  }

  const account = privateKeyToAccount(`0x${rawKey.replace(/^0x/, '')}` as `0x${string}`);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) });
  const client = createPublicClient({ chain: sepolia, transport: http(rpc) });

  const available = await client.readContract({
    address: registrar,
    abi: registrarAbi,
    functionName: 'available',
    args: [input.label],
  });
  if (!available) throw new RegisterError(`"${input.label}" is already registered`, 409);

  const txs: RegisterTx[] = [];

  const regHash = await wallet.writeContract({
    address: registrar,
    abi: registrarAbi,
    functionName: 'register',
    args: [input.label, account.address, resolver, YEAR],
  });
  await client.waitForTransactionReceipt({ hash: regHash });
  txs.push({ step: 'register subname', hash: regHash, url: etherscan(regHash) });

  const node = namehash(`${input.label}.agentindex.eth`);
  const records: [string, string][] = [
    ['url', input.url],
    ['description', input.description],
    ['x402:method', input.method],
    ['x402:price', input.price],
    ['x402:spec', JSON.stringify({ requiredFields: input.requiredFields })],
  ];

  for (const [key, value] of records) {
    const hash = await wallet.writeContract({
      address: resolver,
      abi: resolverAbi,
      functionName: 'setText',
      args: [node, key, value],
    });
    await client.waitForTransactionReceipt({ hash });
    txs.push({ step: `set ${key}`, hash, url: etherscan(hash) });
  }

  return { label: input.label, ensName: `${input.label}.agentindex.eth`, txs };
}
