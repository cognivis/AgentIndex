// Thin client over our Subgraph Studio deployment. Every answer the MCP
// gives an agent carries the pinned deployment id and the block the data
// was synced to, so agents can judge freshness instead of trusting blindly.

export interface ServiceRow {
  id: string;
  label: string;
  ensName: string;
  owner: string;
  expiry: string;
  delisted: boolean;
  delistReason: string | null;
  probeCount: string;
  deliveryRateBps: string;
  honestyRateBps: string;
  avgLatencyMs: string;
  trustScoreBps: string;
  totalPaid: string;
  lastProbedAt: string;
}

export interface ProbeRow {
  delivered: boolean;
  honest: boolean;
  latencyMs: string;
  paymentRef: string;
  timestamp: string;
  txHash: string;
}

export interface Meta {
  deployment: string;
  block: { number: number; timestamp: number };
}

export interface SubgraphClient {
  services(): Promise<{ services: ServiceRow[]; meta: Meta }>;
  serviceWithProbes(
    label: string,
    probeLimit: number,
  ): Promise<{ service: (ServiceRow & { probes: ProbeRow[] }) | null; meta: Meta }>;
}

const SERVICE_FIELDS = `
  id label ensName owner expiry delisted delistReason
  probeCount deliveryRateBps honestyRateBps avgLatencyMs trustScoreBps
  totalPaid lastProbedAt
`;

const META = `_meta { deployment block { number timestamp } }`;

export function createSubgraphClient(url = process.env.SUBGRAPH_QUERY_URL): SubgraphClient {
  if (!url) throw new Error('SUBGRAPH_QUERY_URL is not set');

  async function query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(url!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: document, variables }),
    });
    if (!res.ok) throw new Error(`subgraph query failed: ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`subgraph error: ${json.errors[0].message}`);
    return json.data as T;
  }

  return {
    async services() {
      const data = await query<{ services: ServiceRow[]; _meta: Meta }>(
        `{ services(first: 100, orderBy: trustScoreBps, orderDirection: desc) { ${SERVICE_FIELDS} } ${META} }`,
      );
      return { services: data.services, meta: data._meta };
    },

    async serviceWithProbes(label, probeLimit) {
      const data = await query<{ services: (ServiceRow & { probes: ProbeRow[] })[]; _meta: Meta }>(
        `query ($label: String!, $n: Int!) {
          services(where: { label: $label }) {
            ${SERVICE_FIELDS}
            probes(first: $n, orderBy: timestamp, orderDirection: desc) {
              delivered honest latencyMs paymentRef timestamp txHash
            }
          }
          ${META}
        }`,
        { label, n: probeLimit },
      );
      return { service: data.services[0] ?? null, meta: data._meta };
    },
  };
}
