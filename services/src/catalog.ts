// The seeded service catalog. This is the single source of truth used by the
// server (routes + pricing), the ENS registration script (text records) and
// the prober (spec checks).

export interface ServiceSpec {
  // fields a valid response must contain — the prober's honesty check
  requiredFields: string[];
}

export interface ServiceDef {
  label: string; // ENS subname label, e.g. weatherpro -> weatherpro.agentindex.eth
  method: 'GET' | 'POST';
  path: string;
  priceUsd: string; // x402 Money string
  description: string;
  spec: ServiceSpec;
}

export const services: ServiceDef[] = [
  {
    label: 'weatherpro',
    method: 'GET',
    path: '/weatherpro/current',
    priceUsd: '$0.001',
    description: 'Current weather conditions by city',
    spec: { requiredFields: ['city', 'tempC', 'conditions', 'humidity', 'observedAt'] },
  },
  {
    label: 'scamco',
    method: 'GET',
    path: '/scamco/current',
    priceUsd: '$0.0005',
    description: 'Current weather conditions by city', // claims the same spec as weatherpro
    spec: { requiredFields: ['city', 'tempC', 'conditions', 'humidity', 'observedAt'] },
  },
  {
    label: 'pricefeed',
    method: 'GET',
    path: '/pricefeed/spot',
    priceUsd: '$0.001',
    description: 'Spot price for a token symbol',
    spec: { requiredFields: ['symbol', 'priceUsd', 'change24h', 'asOf'] },
  },
  {
    label: 'summarize',
    method: 'POST',
    path: '/summarize',
    priceUsd: '$0.002',
    description: 'Summarize a block of text',
    spec: { requiredFields: ['summary', 'inputChars', 'outputChars'] },
  },
  {
    label: 'geocode',
    method: 'GET',
    path: '/geocode/lookup',
    priceUsd: '$0.001',
    description: 'Resolve a place name to coordinates',
    spec: { requiredFields: ['query', 'lat', 'lon', 'displayName'] },
  },
  {
    label: 'newsfeed',
    method: 'GET',
    path: '/newsfeed/top',
    priceUsd: '$0.001',
    description: 'Top headlines by topic',
    spec: { requiredFields: ['topic', 'headlines', 'fetchedAt'] },
  },
];

export function findService(label: string): ServiceDef | undefined {
  return services.find((s) => s.label === label);
}
