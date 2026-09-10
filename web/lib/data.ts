// Server-side data loading: subgraph for trust history, ENS for live manifests.
import { loadRootEnv } from './env';
loadRootEnv();
import { createPublicClient, http, namehash, parseAbi, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { assess, formatService, rankForNeed, type Candidate, type Verdict } from '../../mcp/src/rank';
import { freshness } from '../../mcp/src/meta';
import type { ServiceRow, ProbeRow, Meta } from '../../mcp/src/subgraph';

const SUBGRAPH_URL =
  process.env.SUBGRAPH_QUERY_URL ??
  'https://api.studio.thegraph.com/query/1759003/agentindex-sepolia/v0.0.1';

const SERVICE_FIELDS = `
  id label ensName owner expiry delisted delistReason
  probeCount deliveryRateBps honestyRateBps avgLatencyMs trustScoreBps
  totalPaid lastProbedAt
`;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 15 },
  });
  if (!res.ok) throw new Error(`subgraph ${res.status}`);
  const json = (await res.json()) as { data: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export interface FeedProbe extends ProbeRow {
  service: { label: string };
}

export interface Overview {
  services: (ServiceRow & { verdict: Verdict })[];
  stats: { serviceCount: string; activeServiceCount: string; probeCount: string; lastProbeAt: string } | null;
  feed: FeedProbe[];
  meta: Meta;
}

export async function loadOverview(): Promise<Overview> {
  const data = await gql<{
    services: ServiceRow[];
    indexStats: Overview['stats'];
    probes: FeedProbe[];
    _meta: Meta;
  }>(`{
    services(orderBy: trustScoreBps, orderDirection: desc, where: { label_not: "" }) { ${SERVICE_FIELDS} }
    indexStats(id: "global") { serviceCount activeServiceCount probeCount lastProbeAt }
    probes(first: 18, orderBy: timestamp, orderDirection: desc) {
      delivered honest latencyMs paymentRef timestamp txHash
      service { label }
    }
    _meta { deployment block { number timestamp } }
  }`);

  return {
    services: data.services.map((s) => ({ ...s, verdict: assess(s) })),
    stats: data.indexStats,
    feed: data.probes,
    meta: data._meta,
  };
}

export interface ServiceDetail {
  service: (ServiceRow & { verdict: Verdict; probes: ProbeRow[] }) | null;
  manifest: { url: string; description: string; method: string; price: string; spec: string } | null;
  meta: Meta;
}

const registryAbi = parseAbi(['function getResolver(string label) view returns (address)']);
const resolverAbi = parseAbi(['function text(bytes32 node, string key) view returns (string)']);

async function readManifest(label: string): Promise<ServiceDetail['manifest']> {
  const registry = process.env.AGENTINDEX_REGISTRY_ADDRESS as Address | undefined;
  if (!registry) return null;
  try {
    const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
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
    return url ? { url, description, method, price, spec } : null;
  } catch {
    return null;
  }
}

export async function loadService(label: string): Promise<ServiceDetail> {
  const data = await gql<{ services: (ServiceRow & { probes: ProbeRow[] })[]; _meta: Meta }>(
    `query ($label: String!) {
      services(where: { label: $label }) {
        ${SERVICE_FIELDS}
        probes(first: 40, orderBy: timestamp, orderDirection: desc) {
          delivered honest latencyMs paymentRef timestamp txHash
        }
      }
      _meta { deployment block { number timestamp } }
    }`,
    { label },
  );
  const raw = data.services[0] ?? null;
  return {
    service: raw ? { ...raw, verdict: assess(raw) } : null,
    manifest: raw ? await readManifest(label) : null,
    meta: data._meta,
  };
}

// ---- Playground: the same decision the MCP makes, over HTTP ----
// Mirrors resolve_data_need in mcp/src/index.ts, reusing the identical
// rank/assess/formatService logic so the site and the agent agree.

export interface ResolveResult {
  task: string;
  payThis: Record<string, unknown> | null;
  alternatives: Record<string, unknown>[];
  avoid: Record<string, unknown>[];
  note: string;
  _meta: ReturnType<typeof freshness>;
}

async function loadCandidates(): Promise<{ candidates: Candidate[]; meta: Meta }> {
  const data = await gql<{ services: ServiceRow[]; _meta: Meta }>(`{
    services(orderBy: trustScoreBps, orderDirection: desc, where: { delisted: false, label_not: "" }) { ${SERVICE_FIELDS} }
    _meta { deployment block { number timestamp } }
  }`);
  const candidates = await Promise.all(
    data.services.map(async (service) => ({
      service,
      manifest: await readManifest(service.label),
    })),
  );
  return { candidates, meta: data._meta };
}

export async function resolveNeed(task: string): Promise<ResolveResult> {
  const { candidates, meta } = await loadCandidates();
  const ranked = rankForNeed(task, candidates);
  const safe = ranked.filter((c) => {
    const r = assess(c.service).recommendation;
    return r === 'trusted' || r === 'caution';
  });
  const avoid = ranked.filter((c) => assess(c.service).recommendation === 'avoid');

  return {
    task,
    payThis: safe[0] ? formatService(safe[0]) : null,
    alternatives: safe.slice(1).map(formatService),
    avoid: avoid.map(formatService),
    note: safe[0]
      ? `pay ${safe[0].manifest?.price ?? '?'} via x402 at the endpoint above`
      : 'no service with an acceptable track record matches this task',
    _meta: freshness(meta),
  };
}

// find_service over HTTP — capability search, same as the MCP tool.
export async function findServices(need: string) {
  const { candidates, meta } = await loadCandidates();
  const matches = rankForNeed(need, candidates);
  return { need, matches: matches.map(formatService), _meta: freshness(meta) };
}

// check_trust over HTTP — full report for one service incl. recent probes.
export async function checkTrust(name: string) {
  const label = name.replace(/\.agentindex\.eth$/, '').trim();
  const { service, manifest, meta } = await loadService(label);
  if (!service) return { error: `no service "${label}" in the index`, _meta: freshness(meta) };
  return {
    ...formatService({ service, manifest }),
    recentProbes: service.probes.map((p) => ({
      delivered: p.delivered,
      honest: p.honest,
      latencyMs: Number(p.latencyMs),
      hederaPayment: p.paymentRef,
      attestationTx: p.txHash,
      at: new Date(Number(p.timestamp) * 1000).toISOString(),
    })),
    _meta: freshness(meta),
  };
}

export interface Receipt {
  delivered: boolean;
  honest: boolean;
  latencyMs: number;
  paymentRef: string;
  txHash: string;
  timestamp: number;
  hashscanUrl: string | null;
  etherscanUrl: string;
}

// The "watch it pay" evidence: the most recent REAL probe payments the
// prober already settled against this service. Genuine on-chain receipts,
// no fresh spend per page view.
export async function loadReceipts(label: string, limit = 6): Promise<{ label: string; receipts: Receipt[]; _meta: ReturnType<typeof freshness> }> {
  const { service, meta } = await (async () => {
    const detail = await loadService(label);
    return { service: detail.service, meta: detail.meta };
  })();
  const receipts: Receipt[] = (service?.probes ?? [])
    .filter((p) => p.paymentRef)
    .slice(0, limit)
    .map((p) => ({
      delivered: p.delivered,
      honest: p.honest,
      latencyMs: Number(p.latencyMs),
      paymentRef: p.paymentRef,
      txHash: p.txHash,
      timestamp: Number(p.timestamp),
      hashscanUrl: p.paymentRef ? `https://hashscan.io/testnet/transaction/${p.paymentRef}` : null,
      etherscanUrl: `https://sepolia.etherscan.io/tx/${p.txHash}`,
    }));
  return { label, receipts, _meta: freshness(meta) };
}

export const bps = (v: string) => Number(v) / 100;
export const ago = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
