// Service discovery. The real path reads the ENSv2 registry: services that
// registered a subname of agentindex.eth get probed, delisted ones drop out.
// The host-based path (free /health + /spec endpoints) remains as a dev fallback.
import {
  createPublicClient,
  http,
  keccak256,
  namehash,
  parseAbi,
  parseAbiItem,
  toBytes,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';

export interface ProbeTarget {
  label: string;
  url: string;
  method: 'GET' | 'POST';
  body?: unknown;
  requiredFields: string[];
  // where this target came from — 'ens'/'host' are our own registry, 'external'
  // is a real third-party service pulled from a public x402 directory
  source?: 'ens' | 'host' | 'external';
  // oracle-check metadata (only set for objective-data services like price feeds)
  category?: 'price' | 'other';
  symbol?: string; // e.g. "ETH" — the asset whose price we cross-check
  pricePath?: string; // dot-path to the price in the response, e.g. "data.price"
  // directory metadata for external services
  network?: string; // caip2, e.g. "eip155:8453" (Base)
  priceUsd?: number; // advertised per-call price
  asset?: string; // on-chain payment asset advertised by the directory
  slug?: string;
}

// price-feed metadata per known label: which symbol the sample input asks for
// and where the price sits in the response, so the oracle can cross-check it.
// Our own pricefeed reports `priceUsd`. Probe BTC so it can form a same-symbol
// comparison set with the curated external TickersFeed endpoint.
const PRICE_META: Record<string, { symbol: string; pricePath: string }> = {
  pricefeed: { symbol: 'BTC', pricePath: 'priceUsd' },
};

// sample inputs per known label; unknown services get probed bare
const SAMPLE_INPUTS: Record<string, { query?: string; body?: unknown }> = {
  weatherpro: { query: 'city=singapore' },
  scamco: { query: 'city=singapore' },
  pricefeed: { query: 'symbol=BTC' },
  geocode: { query: 'q=singapore' },
  newsfeed: { query: 'topic=crypto' },
  summarize: {
    body: {
      text: 'Agents pay for services over x402. Many services are honest. Some take the money and return junk. AgentIndex probes them all and keeps receipts.',
    },
  },
};

const serviceRegisteredEvent = parseAbiItem(
  'event ServiceRegistered(bytes32 indexed labelhash, string label, address indexed owner, uint64 expiry, uint256 price)',
);

const registryAbi = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function getResolver(string label) view returns (address)',
]);

const resolverAbi = parseAbi(['function text(bytes32 node, string key) view returns (string)']);

const STATUS_REGISTERED = 2;

export async function discoverFromRegistry(): Promise<ProbeTarget[]> {
  const registrar = process.env.SUBNAME_REGISTRAR_ADDRESS as Address;
  const registry = process.env.AGENTINDEX_REGISTRY_ADDRESS as Address;
  const fromBlock = BigInt(process.env.REGISTRAR_DEPLOY_BLOCK ?? '11650000');
  if (!registrar || !registry) throw new Error('registrar/registry addresses not configured');

  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });

  // label enumeration: prefer the subgraph (public sepolia RPCs have proven
  // unreliable for historical getLogs); registration status, resolver and
  // manifest are still verified on-chain below, so the chain stays the
  // source of truth for what actually gets probed.
  const labels = new Set<string>();
  const subgraphUrl = process.env.SUBGRAPH_QUERY_URL;
  if (subgraphUrl) {
    const res = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ services(where: { label_not: "" }) { label } }' }),
    });
    if (!res.ok) throw new Error(`subgraph discovery failed: ${res.status}`);
    const json = (await res.json()) as { data?: { services: { label: string }[] } };
    for (const s of json.data?.services ?? []) labels.add(s.label);
  } else {
    // fallback: chunked log scan (public RPCs cap ranges at ~50k blocks)
    const head = await client.getBlockNumber();
    const CHUNK = 45_000n;
    for (let from = fromBlock; from <= head; from += CHUNK) {
      const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
      const logs = await client.getLogs({
        address: registrar,
        event: serviceRegisteredEvent,
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) labels.add(l.args.label!);
    }
  }

  const targets: ProbeTarget[] = [];
  for (const label of labels) {
    const status = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'getStatus',
      args: [BigInt(keccak256(toBytes(label)))],
    });
    if (status !== STATUS_REGISTERED) continue; // expired or delisted

    const resolver = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: 'getResolver',
      args: [label],
    });
    if (resolver === '0x0000000000000000000000000000000000000000') continue;

    const node = namehash(`${label}.agentindex.eth`);
    const readText = (key: string) =>
      client.readContract({ address: resolver, abi: resolverAbi, functionName: 'text', args: [node, key] });

    const [url, method, specRaw] = await Promise.all([
      readText('url'),
      readText('x402:method'),
      readText('x402:spec'),
    ]);
    if (!url || !specRaw) continue; // no manifest, nothing to verify against

    let requiredFields: string[] = [];
    try {
      requiredFields = JSON.parse(specRaw).requiredFields ?? [];
    } catch {
      // unparseable spec: still probe for delivery, honesty will fail open
    }

    const sample = SAMPLE_INPUTS[label] ?? {};
    const qs = sample.query ? `?${sample.query}` : '';
    const price = PRICE_META[label];
    targets.push({
      label,
      url: `${url}${qs}`,
      method: (method === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
      body: sample.body,
      requiredFields,
      source: 'ens',
      ...(price ? { category: 'price' as const, symbol: price.symbol, pricePath: price.pricePath } : {}),
    });
  }
  return targets;
}

export async function discoverFromHost(baseUrl: string): Promise<ProbeTarget[]> {
  const health = await fetch(`${baseUrl}/health`);
  if (!health.ok) throw new Error(`services host unhealthy: ${health.status}`);
  const { services: labels } = (await health.json()) as { services: string[] };

  const targets: ProbeTarget[] = [];
  for (const label of labels) {
    const specRes = await fetch(`${baseUrl}/${label}/spec`);
    if (!specRes.ok) continue;
    const spec = (await specRes.json()) as {
      method: 'GET' | 'POST';
      path: string;
      spec: { requiredFields: string[] };
    };

    const sample = SAMPLE_INPUTS[label] ?? {};
    const qs = sample.query ? `?${sample.query}` : '';
    const price = PRICE_META[label];
    targets.push({
      label,
      url: `${baseUrl}${spec.path}${qs}`,
      method: spec.method,
      body: sample.body,
      requiredFields: spec.spec.requiredFields,
      source: 'host',
      ...(price ? { category: 'price' as const, symbol: price.symbol, pricePath: price.pricePath } : {}),
    });
  }
  return targets;
}
