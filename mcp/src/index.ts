import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { createSubgraphClient } from './subgraph.js';
import { createManifestReader } from './ens.js';
import { assess, formatService, rankForNeed, type Candidate } from './rank.js';
import { freshness } from './meta.js';

const subgraph = createSubgraphClient();
const manifests = createManifestReader();

const server = new McpServer({ name: 'agentindex', version: '0.1.0' });

function reply(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

async function loadCandidates(): Promise<{ candidates: Candidate[]; meta: Parameters<typeof freshness>[0] }> {
  const { services, meta } = await subgraph.services();
  const active = services.filter((s) => !s.delisted && s.label !== '');
  const candidates = await Promise.all(
    active.map(async (service) => ({
      service,
      manifest: await manifests.read(service.label).catch(() => null),
    })),
  );
  return { candidates, meta };
}

server.registerTool(
  'find_service',
  {
    description:
      'Search the AgentIndex registry for x402 services matching a capability, e.g. "weather data" or "token prices". Returns matching services with endpoints, prices and their probed trust scores.',
    inputSchema: {
      need: z.string().describe('What the service should do, in plain words'),
    },
  },
  async ({ need }) => {
    const { candidates, meta } = await loadCandidates();
    const matches = rankForNeed(need, candidates);
    return reply({
      need,
      matches: matches.map(formatService),
      _meta: freshness(meta),
    });
  },
);

server.registerTool(
  'check_trust',
  {
    description:
      'Full trust report for one service: score, delivery/honesty rates, latency, and recent probes with their Hedera payment receipts. Accepts a label ("weatherpro") or full name ("weatherpro.agentindex.eth").',
    inputSchema: {
      name: z.string().describe('Service label or ENS name'),
      probes: z.number().int().min(1).max(50).default(10).describe('How many recent probes to include'),
    },
  },
  async ({ name, probes }) => {
    const label = name.replace(/\.agentindex\.eth$/, '');
    const { service, meta } = await subgraph.serviceWithProbes(label, probes);
    if (!service) {
      return reply({ error: `no service "${label}" in the index`, _meta: freshness(meta) });
    }
    const manifest = await manifests.read(label).catch(() => null);
    return reply({
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
    });
  },
);

server.registerTool(
  'resolve_data_need',
  {
    description:
      'End-to-end selection: describe a task, get back the single best service to pay (plus ranked alternatives and any services to avoid). Use this before spending money over x402.',
    inputSchema: {
      task: z.string().describe('The task, e.g. "get current weather for Singapore"'),
    },
  },
  async ({ task }) => {
    const { candidates, meta } = await loadCandidates();
    const ranked = rankForNeed(task, candidates);

    const safe = ranked.filter((c) => {
      const r = assess(c.service).recommendation;
      return r === 'trusted' || r === 'caution';
    });
    const avoid = ranked.filter((c) => assess(c.service).recommendation === 'avoid');

    return reply({
      task,
      payThis: safe[0] ? formatService(safe[0]) : null,
      alternatives: safe.slice(1).map(formatService),
      avoid: avoid.map(formatService),
      note: safe[0]
        ? `pay ${safe[0].manifest?.price ?? '?'} via x402 at the endpoint above`
        : 'no service with an acceptable track record matches this task',
      _meta: freshness(meta),
    });
  },
);

server.registerTool(
  'get_verified_data',
  {
    description:
      'One call: pick the most-trusted service for a need, fetch the data from it, and return the data together with that provider\'s trust score and its latest on-chain probe receipt as proof. Use when you want the answer AND a record of why the source was trusted. Scam / low-trust providers are never selected.',
    inputSchema: {
      need: z.string().describe('The data you want, e.g. "current ETH price" or "weather in Singapore"'),
    },
  },
  async ({ need }) => {
    const { candidates, meta } = await loadCandidates();
    const ranked = rankForNeed(need, candidates);
    const best = ranked.find((c) => {
      const r = assess(c.service).recommendation;
      return r === 'trusted' || r === 'caution';
    });

    if (!best || !best.manifest?.url) {
      return reply({
        need,
        data: null,
        reason: 'no service with an acceptable track record (and a readable endpoint) matches this need',
        avoid: ranked
          .filter((c) => assess(c.service).recommendation === 'avoid')
          .map(formatService),
        _meta: freshness(meta),
      });
    }

    // fetch the data from the chosen provider. NOTE: this scaffold reads the
    // endpoint directly — it works for free/preview reads and surfaces the x402
    // terms when payment is required. Settling the payment (Hedera x402, the
    // prober already does this) is wired in the demo-agent path; here we prove
    // the selection + proof flow end to end.
    const method = best.manifest.method === 'POST' ? 'POST' : 'GET';
    let data: unknown = null;
    let paymentRequired: unknown = null;
    let fetchError: string | null = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(best.manifest.url, { method, signal: ctrl.signal }).finally(() =>
        clearTimeout(t),
      );
      if (res.status === 402) {
        paymentRequired = {
          note: 'provider requires x402 payment; pay via the terms below, then re-request',
          price: best.manifest.price ?? null,
          endpoint: best.manifest.url,
          accepts: await res.json().catch(() => null),
        };
      } else if (res.ok) {
        data = await res.json().catch(() => null);
      } else {
        fetchError = `provider returned ${res.status}`;
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : 'request failed';
    }

    // proof: the most recent on-chain probe receipt for the chosen provider
    const { service: withProbes } = await subgraph
      .serviceWithProbes(best.service.label, 1)
      .catch(() => ({ service: null }));
    const latest = withProbes?.probes?.[0];
    const proof = latest
      ? {
          delivered: latest.delivered,
          honest: latest.honest,
          hederaPayment: latest.paymentRef,
          attestationTx: latest.txHash,
          at: new Date(Number(latest.timestamp) * 1000).toISOString(),
        }
      : null;

    return reply({
      need,
      paidService: formatService(best),
      data,
      paymentRequired,
      error: fetchError,
      proof,
      _meta: freshness(meta),
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('agentindex mcp ready (stdio)');
