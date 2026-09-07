import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import type { ProbeOutcome } from './verify.js';

const attestationAbi = [
  {
    type: 'function',
    name: 'attest',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'delivered', type: 'bool' },
      { name: 'honest', type: 'bool' },
      { name: 'latencyMs', type: 'uint32' },
      { name: 'responseHash', type: 'bytes32' },
      { name: 'amountPaid', type: 'uint256' },
      { name: 'paymentRef', type: 'string' },
    ],
    outputs: [],
  },
] as const;

export interface Attestor {
  attest(
    label: string,
    outcome: ProbeOutcome,
    amountPaid: bigint,
    paymentRef: string,
  ): Promise<string>;
}

export function createAttestor(): Attestor {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.PROBER_PRIVATE_KEY;
  const registry = process.env.ATTESTATION_REGISTRY_ADDRESS as Address | undefined;
  if (!rpcUrl || !pk || !registry) {
    throw new Error('SEPOLIA_RPC_URL, PROBER_PRIVATE_KEY and ATTESTATION_REGISTRY_ADDRESS are required');
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

  return {
    async attest(label, outcome, amountPaid, paymentRef) {
      const hash = await wallet.writeContract({
        address: registry,
        abi: attestationAbi,
        functionName: 'attest',
        args: [
          keccak256(toBytes(label)),
          outcome.delivered,
          outcome.honest,
          outcome.latencyMs,
          outcome.responseHash,
          amountPaid,
          paymentRef,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
  };
}

/// Logs instead of writing on-chain. Used before contracts are deployed and in dry runs.
export function createDryRunAttestor(): Attestor {
  return {
    async attest(label, outcome) {
      console.log(
        `  [dry-run] attest ${label}: delivered=${outcome.delivered} honest=${outcome.honest} latency=${outcome.latencyMs}ms`,
      );
      return '0xdry';
    },
  };
}
