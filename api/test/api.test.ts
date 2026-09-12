import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import type { ServiceRow, ProbeRow, Meta, SubgraphClient } from '../../mcp/src/subgraph.js';
import type { ManifestReader } from '../../mcp/src/ens.js';

const meta: Meta = {
  deployment: 'QmTestDeployment',
  block: { number: 11700000, timestamp: Math.floor(Date.now() / 1000) - 30 },
};

function svc(overrides: Partial<ServiceRow>): ServiceRow {
  return {
    id: '0x01',
    label: 'weatherpro',
    ensName: 'weatherpro.agentindex.eth',
    owner: '0xabc',
    expiry: '2000000000',
    delisted: false,
    delistReason: null,
    probeCount: '120',
    deliveryRateBps: '9900',
    honestyRateBps: '9800',
    avgLatencyMs: '450',
    trustScoreBps: '9400',
    totalPaid: '39600000',
    lastProbedAt: '1757000000',
    ...overrides,
  };
}

const weatherpro = svc({});
const scamco = svc({
  id: '0x02',
  label: 'scamco',
  ensName: 'scamco.agentindex.eth',
  deliveryRateBps: '1200',
  honestyRateBps: '0',
  trustScoreBps: '2100',
});

const probes: ProbeRow[] = [
  {
    delivered: true,
    honest: true,
    latencyMs: '431',
    paymentRef: '0.0.7162784@1788780243.970842753',
    timestamp: '1757000000',
    txHash: '0xattest1',
    valid: true,
    invalidReason: null,
  },
];

const subgraph: SubgraphClient = {
  async services() {
    return { services: [weatherpro, scamco], meta };
  },
  async serviceWithProbes(label) {
    const found = [weatherpro, scamco].find((s) => s.label === label);
    return { service: found ? { ...found, probes } : null, meta };
  },
};

const manifests: ManifestReader = {
  async read(label) {
    return {
      url: `http://localhost:4021/${label}/current`,
      description: 'Current weather conditions by city',
      method: 'GET',
      price: label === 'scamco' ? '$0.0005' : '$0.001',
      spec: '{"requiredFields":["city","tempC"]}',
    };
  },
};

const app = buildApp({ subgraph, manifests }, { paywall: false });

describe('GET /v1/services', () => {
  it('lists services with scores and freshness meta', async () => {
    const res = await request(app).get('/v1/services');
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(2);
    expect(res.body.services[0].trustScore).toBe(94);
    expect(res.body._meta.subgraphDeployment).toBe('QmTestDeployment');
    expect(res.body._meta.fresh).toBe(true);
  });
});

describe('GET /v1/trust/:label', () => {
  it('returns the report card with payment receipts', async () => {
    const res = await request(app).get('/v1/trust/weatherpro');
    expect(res.status).toBe(200);
    expect(res.body.recommendation).toBe('trusted');
    expect(res.body.recentProbes[0].hederaPayment).toContain('0.0.7162784');
  });

  it('accepts the full ens name too', async () => {
    const res = await request(app).get('/v1/trust/scamco.agentindex.eth');
    expect(res.status).toBe(200);
    expect(res.body.recommendation).toBe('avoid');
  });

  it('404s for unknown services', async () => {
    const res = await request(app).get('/v1/trust/ghost');
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/resolve', () => {
  it('recommends the honest service and flags the scam', async () => {
    const res = await request(app).get('/v1/resolve?task=current weather in singapore');
    expect(res.status).toBe(200);
    expect(res.body.payThis.label).toBe('weatherpro');
    expect(res.body.avoid.map((s: { label: string }) => s.label)).toContain('scamco');
  });

  it('rejects a missing task', async () => {
    const res = await request(app).get('/v1/resolve');
    expect(res.status).toBe(400);
  });
});

describe('health', () => {
  it('is free and reports paywall state', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.paywall).toBe(false);
  });
});
