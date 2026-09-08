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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('agentindex mcp ready (stdio)');
