// Pure ranking/matching logic — kept free of I/O so it's easy to test.
import type { ServiceRow } from './subgraph.js';
import type { Manifest } from './ens.js';

export interface Candidate {
  service: ServiceRow;
  manifest: Manifest | null;
}

// crude but explainable: score = how many query words appear in the
// service's label + description + spec
export function matchScore(need: string, c: Candidate): number {
  const haystack = [
    c.service.label,
    c.service.ensName,
    c.manifest?.description ?? '',
    c.manifest?.spec ?? '',
  ]
    .join(' ')
    .toLowerCase();

  const words = need
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  let hits = 0;
  for (const w of words) {
    if (haystack.includes(w)) hits++;
  }
  return hits;
}

export interface Verdict {
  recommendation: 'trusted' | 'caution' | 'avoid' | 'unproven';
  reasons: string[];
}

export function assess(service: ServiceRow): Verdict {
  const reasons: string[] = [];
  const probes = Number(service.probeCount);
  const trust = Number(service.trustScoreBps);
  const delivery = Number(service.deliveryRateBps);
  const honesty = Number(service.honestyRateBps);

  if (service.delisted) {
    return {
      recommendation: 'avoid',
      reasons: [`delisted from the registry: ${service.delistReason ?? 'no reason recorded'}`],
    };
  }
  if (probes === 0) {
    return { recommendation: 'unproven', reasons: ['no probe history yet'] };
  }

  if (delivery < 5000) reasons.push(`delivers only ${(delivery / 100).toFixed(1)}% of paid requests`);
  if (honesty < 5000) reasons.push(`response matches its claimed spec only ${(honesty / 100).toFixed(1)}% of the time`);
  if (delivery >= 9500 && honesty >= 9500) reasons.push(`${probes} probes, consistently delivers what it promises`);

  // taking payments while (almost) never honoring the spec is the scam
  // pattern — an outright avoid no matter what the blended score says
  if (probes >= 10 && honesty < 2000) {
    return { recommendation: 'avoid', reasons };
  }
  if (trust < 4000) return { recommendation: 'avoid', reasons };
  if (trust < 7500) {
    if (reasons.length === 0) reasons.push('mixed track record');
    return { recommendation: 'caution', reasons };
  }
  if (reasons.length === 0) reasons.push('solid track record');
  return { recommendation: 'trusted', reasons };
}

export function rankForNeed(need: string, candidates: Candidate[]): Candidate[] {
  return candidates
    .map((c) => ({ c, match: matchScore(need, c) }))
    .filter((x) => x.match > 0)
    .sort((a, b) => {
      if (b.match !== a.match) return b.match - a.match;
      return Number(b.c.service.trustScoreBps) - Number(a.c.service.trustScoreBps);
    })
    .map((x) => x.c);
}

export function formatService(c: Candidate): Record<string, unknown> {
  const v = assess(c.service);
  return {
    name: c.service.ensName,
    label: c.service.label,
    endpoint: c.manifest?.url ?? null,
    method: c.manifest?.method ?? null,
    price: c.manifest?.price ?? null,
    description: c.manifest?.description ?? null,
    trustScore: Number(c.service.trustScoreBps) / 100, // 0-100
    deliveryRate: Number(c.service.deliveryRateBps) / 100,
    honestyRate: Number(c.service.honestyRateBps) / 100,
    avgLatencyMs: Number(c.service.avgLatencyMs),
    probeCount: Number(c.service.probeCount),
    lastProbedAt: Number(c.service.lastProbedAt),
    recommendation: v.recommendation,
    reasons: v.reasons,
  };
}
