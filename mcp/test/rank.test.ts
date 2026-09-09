import { describe, expect, it } from 'vitest';
import { assess, formatService, matchScore, rankForNeed, type Candidate } from '../src/rank.js';
import type { ServiceRow } from '../src/subgraph.js';

function svc(overrides: Partial<ServiceRow>): ServiceRow {
  return {
    id: '0x01',
    label: 'weatherpro',
    ensName: 'weatherpro.agentindex.eth',
    owner: '0xabc',
    expiry: '2000000000',
    delisted: false,
    delistReason: null,
    probeCount: '100',
    deliveryRateBps: '9900',
    honestyRateBps: '9900',
    avgLatencyMs: '400',
    trustScoreBps: '9500',
    totalPaid: '33000000',
    lastProbedAt: '1757000000',
    ...overrides,
  };
}

function cand(service: ServiceRow, description = '', spec = ''): Candidate {
  return {
    service,
    manifest: {
      url: `http://localhost:4021/${service.label}`,
      description,
      method: 'GET',
      price: '$0.001',
      spec,
    },
  };
}

const weatherpro = cand(svc({}), 'Current weather conditions by city', 'tempC humidity');
const scamco = cand(
  svc({
    label: 'scamco',
    ensName: 'scamco.agentindex.eth',
    deliveryRateBps: '1200',
    honestyRateBps: '0',
    trustScoreBps: '2100',
  }),
  'Current weather conditions by city',
);
const pricefeed = cand(svc({ label: 'pricefeed', ensName: 'pricefeed.agentindex.eth' }), 'Spot price for a token symbol');

describe('matchScore', () => {
  it('matches on description words', () => {
    expect(matchScore('I need weather data', weatherpro)).toBeGreaterThan(0);
    expect(matchScore('I need weather data', pricefeed)).toBe(0);
  });

  it('ignores short filler words', () => {
    expect(matchScore('is it by on at', weatherpro)).toBe(0);
  });
});

describe('rankForNeed', () => {
  it('ranks equal matches by trust score', () => {
    const ranked = rankForNeed('current weather', [scamco, weatherpro]);
    expect(ranked[0].service.label).toBe('weatherpro');
    expect(ranked[1].service.label).toBe('scamco');
  });

  it('drops non-matching services', () => {
    const ranked = rankForNeed('weather', [weatherpro, scamco, pricefeed]);
    expect(ranked.map((c) => c.service.label)).not.toContain('pricefeed');
  });
});

describe('assess', () => {
  it('trusts a consistent performer', () => {
    const v = assess(weatherpro.service);
    expect(v.recommendation).toBe('trusted');
  });

  it('flags the scam pattern with concrete reasons', () => {
    const v = assess(scamco.service);
    expect(v.recommendation).toBe('avoid');
    expect(v.reasons.join(' ')).toContain('12.0%');
  });

  it('marks unprobed services as unproven, not trusted', () => {
    const v = assess(svc({ probeCount: '0', trustScoreBps: '0' }));
    expect(v.recommendation).toBe('unproven');
  });

  it('delisting overrides everything', () => {
    const v = assess(svc({ delisted: true, delistReason: 'spec fraud' }));
    expect(v.recommendation).toBe('avoid');
    expect(v.reasons[0]).toContain('spec fraud');
  });

  it('middling scores get caution', () => {
    const v = assess(svc({ trustScoreBps: '6000', deliveryRateBps: '7000', honestyRateBps: '7000' }));
    expect(v.recommendation).toBe('caution');
  });
});

describe('formatService', () => {
  it('converts bps to human percentages and includes the endpoint', () => {
    const out = formatService(weatherpro);
    expect(out.trustScore).toBe(95);
    expect(out.deliveryRate).toBe(99);
    expect(out.endpoint).toBe('http://localhost:4021/weatherpro');
    expect(out.recommendation).toBe('trusted');
  });

  it('survives a missing manifest', () => {
    const out = formatService({ service: weatherpro.service, manifest: null });
    expect(out.endpoint).toBeNull();
    expect(out.trustScore).toBe(95);
  });
});

describe('spec-fraud rule', () => {
  it('flags high-delivery zero-honesty services as avoid, not caution', () => {
    const v = assess(svc({ deliveryRateBps: '8100', honestyRateBps: '0', trustScoreBps: '5750' }));
    expect(v.recommendation).toBe('avoid');
  });

  it('does not condemn young services on thin evidence', () => {
    const v = assess(svc({ probeCount: '3', deliveryRateBps: '10000', honestyRateBps: '0', trustScoreBps: '7500' }));
    expect(v.recommendation).not.toBe('avoid');
  });
});
