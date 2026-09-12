import express, { type Express } from 'express';
import { paymentMiddleware } from '@x402/express';
import type { RoutesConfig } from '@x402/core/server';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

// the query layer is shared with the MCP server — same data, second door
import type { SubgraphClient } from '../../mcp/src/subgraph.js';
import type { ManifestReader } from '../../mcp/src/ens.js';
import { assess, formatService, rankForNeed, type Candidate } from '../../mcp/src/rank.js';
import { freshness } from '../../mcp/src/meta.js';

export interface ApiDeps {
  subgraph: SubgraphClient;
  manifests: ManifestReader;
}

export interface ApiOptions {
  paywall: boolean;
  payTo?: string; // Hedera account collecting query fees
}

// $0.01 per trust query, settled in HBAR (~$1 = 3.3 HBAR, 1 HBAR = 100M tinybars)
const QUERY_PRICE_TINYBARS = String(Math.round(0.01 * 3.3 * 100_000_000));

async function loadCandidates(deps: ApiDeps) {
  const { services, meta } = await deps.subgraph.services();
  const active = services.filter((s) => !s.delisted && s.label !== '');
  const candidates: Candidate[] = await Promise.all(
    active.map(async (service) => ({
      service,
      manifest: await deps.manifests.read(service.label).catch(() => null),
    })),
  );
  return { candidates, meta };
}

export function buildApp(deps: ApiDeps, opts: ApiOptions): Express {
  const app = express();
  // x402 derives its resource URL from the Express request. Honor HTTPS only
  // when the forwarding header came from our loopback reverse proxy.
  app.set('trust proxy', 'loopback');

  if (opts.paywall) {
    if (!opts.payTo) throw new Error('payTo is required when the paywall is on');
    const facilitator = new HTTPFacilitatorClient({
      url: process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator',
    });
    const rs = new x402ResourceServer(facilitator).register('hedera:*', new ExactHederaScheme({}));

    const paid = {
      accepts: [
        {
          scheme: 'exact' as const,
          price: { asset: '0.0.0', amount: QUERY_PRICE_TINYBARS },
          network: 'hedera:testnet' as const,
          payTo: opts.payTo,
        },
      ],
      description: 'AgentIndex trust query',
      mimeType: 'application/json',
    };
    const routes: RoutesConfig = {
      'GET /v1/services': paid,
      'GET /v1/trust/:label': paid,
      'GET /v1/resolve': paid,
    };
    app.use(paymentMiddleware(routes, rs));
  }

  app.get('/v1/services', async (_req, res) => {
    const { candidates, meta } = await loadCandidates(deps);
    res.json({ services: candidates.map(formatService), _meta: freshness(meta) });
  });

  app.get('/v1/trust/:label', async (req, res) => {
    const label = req.params.label.replace(/\.agentindex\.eth$/, '');
    const { service, meta } = await deps.subgraph.serviceWithProbes(label, 10);
    if (!service) {
      res.status(404).json({ error: `no service "${label}" in the index`, _meta: freshness(meta) });
      return;
    }
    const manifest = await deps.manifests.read(label).catch(() => null);
    res.json({
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
  });

  app.get('/v1/resolve', async (req, res) => {
    const task = String(req.query.task ?? '');
    if (!task) {
      res.status(400).json({ error: 'task query param is required' });
      return;
    }
    const { candidates, meta } = await loadCandidates(deps);
    const ranked = rankForNeed(task, candidates);
    const safe = ranked.filter((c) => {
      const r = assess(c.service).recommendation;
      return r === 'trusted' || r === 'caution';
    });
    const avoid = ranked.filter((c) => assess(c.service).recommendation === 'avoid');
    res.json({
      task,
      payThis: safe[0] ? formatService(safe[0]) : null,
      alternatives: safe.slice(1).map(formatService),
      avoid: avoid.map(formatService),
      _meta: freshness(meta),
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', paywall: opts.paywall, pricePerQuery: '$0.01' });
  });

  return app;
}
