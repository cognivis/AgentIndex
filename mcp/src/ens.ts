// Live manifest lookup: the subgraph carries the trust record, but a
// service's current endpoint/price/spec live in its ENS text records.
import { createPublicClient, http, namehash, parseAbi, type Address } from 'viem';
import { sepolia } from 'viem/chains';

const registryAbi = parseAbi(['function getResolver(string label) view returns (address)']);
const resolverAbi = parseAbi(['function text(bytes32 node, string key) view returns (string)']);

export interface Manifest {
  url: string;
  description: string;
  method: string;
  price: string;
  spec: string;
}

export interface ManifestReader {
  read(label: string): Promise<Manifest | null>;
}

export function createManifestReader(): ManifestReader {
  const registry = process.env.AGENTINDEX_REGISTRY_ADDRESS as Address;
  if (!registry) throw new Error('AGENTINDEX_REGISTRY_ADDRESS is not set');

  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });

  return {
    async read(label) {
      const resolver = await client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: 'getResolver',
        args: [label],
      });
      if (resolver === '0x0000000000000000000000000000000000000000') return null;

      const node = namehash(`${label}.agentindex.eth`);
      const text = (key: string) =>
        client.readContract({ address: resolver, abi: resolverAbi, functionName: 'text', args: [node, key] });

      const [url, description, method, price, spec] = await Promise.all([
        text('url'),
        text('description'),
        text('x402:method'),
        text('x402:price'),
        text('x402:spec'),
      ]);
      if (!url) return null;
      return { url, description, method, price, spec };
    },
  };
}
