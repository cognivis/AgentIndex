// Service discovery. v1 asks the services host what it offers (free /health +
// /spec endpoints). Day 5 replaces this with the ENSv2 registry so the prober
// only trusts what's actually registered on-chain.

export interface ProbeTarget {
  label: string;
  url: string;
  method: 'GET' | 'POST';
  body?: unknown;
  requiredFields: string[];
}

// sample inputs per known label; unknown services get probed bare
const SAMPLE_INPUTS: Record<string, { query?: string; body?: unknown }> = {
  weatherpro: { query: 'city=singapore' },
  scamco: { query: 'city=singapore' },
  pricefeed: { query: 'symbol=ETH' },
  geocode: { query: 'q=singapore' },
  newsfeed: { query: 'topic=crypto' },
  summarize: {
    body: {
      text: 'Agents pay for services over x402. Many services are honest. Some take the money and return junk. AgentIndex probes them all and keeps receipts.',
    },
  },
};

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
    targets.push({
      label,
      url: `${baseUrl}${spec.path}${qs}`,
      method: spec.method,
      body: sample.body,
      requiredFields: spec.spec.requiredFields,
    });
  }
  return targets;
}
