import { describe, expect, it } from 'vitest';
import type { ProbeTarget } from '../src/discovery.js';
import type { ProbeResult } from '../src/probe.js';
import { applyConsensus, extractClaimedPrice, median } from '../src/consensus.js';

const result = (
  label: string,
  price: unknown,
  overrides: Partial<ProbeResult> = {},
): ProbeResult => {
  const target: ProbeTarget = {
    label,
    url: `https://example.test/${label}`,
    method: 'GET',
    requiredFields: ['data'],
    category: 'price',
    symbol: 'BTC',
    pricePath: 'data.price',
  };
  return {
    target,
    body: JSON.stringify({ data: { price } }),
    specHonest: true,
    outcome: {
      delivered: true,
      honest: true,
      latencyMs: 10,
      responseHash: `0x${'0'.repeat(64)}`,
    },
    paymentRef: '',
    amountPaid: 0n,
    ...overrides,
  };
};

describe('median', () => {
  it('handles odd and even sets without mutating input', () => {
    const values = [30, 10, 20];
    expect(median(values)).toBe(20);
    expect(values).toEqual([30, 10, 20]);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([])).toBeNull();
  });
});

describe('extractClaimedPrice', () => {
  it('reads nested numeric strings and rejects missing or invalid values', () => {
    expect(extractClaimedPrice(result('a', '$70,000.50'))).toBe(70_000.5);
    expect(extractClaimedPrice(result('a', 'nope'))).toBeNull();
    expect(extractClaimedPrice({ ...result('a', 1), body: '{' })).toBeNull();
  });
});

describe('applyConsensus', () => {
  it('marks close same-symbol peers as agreeing', () => {
    const checked = applyConsensus([result('a', 100), result('b', 101)], 200);
    expect(checked.map((r) => r.consensusCheck?.verdict)).toEqual(['agree', 'agree']);
    expect(checked.every((r) => r.outcome.honest)).toBe(true);
  });

  it('reports a divergent pair as split without accusing either provider', () => {
    const checked = applyConsensus([result('a', 100), result('b', 150)], 200);
    expect(checked.map((r) => r.consensusCheck?.verdict)).toEqual(['split', 'split']);
    expect(checked.every((r) => r.outcome.honest)).toBe(true);
  });

  it('downgrades a clear outlier when at least three providers establish a median', () => {
    const checked = applyConsensus(
      [result('a', 100), result('b', 101), result('liar', 150)],
      200,
    );
    expect(checked.map((r) => r.consensusCheck?.verdict)).toEqual(['agree', 'agree', 'deviates']);
    expect(checked.map((r) => r.outcome.honest)).toEqual([true, true, false]);
  });

  it('groups by normalized symbol', () => {
    const eth = result('eth', 2_000);
    eth.target.symbol = 'eth';
    const btc = result('btc', 70_000);
    const checked = applyConsensus([eth, btc], 200);
    expect(checked.map((r) => r.consensusCheck?.verdict)).toEqual(['na', 'na']);
  });

  it('does not include failed specs or invalid prices in the comparison set', () => {
    const badSpec = result('bad-spec', 100, { specHonest: false });
    const invalid = result('invalid', 'not-a-price');
    const checked = applyConsensus([result('good', 100), badSpec, invalid], 200);
    expect(checked.every((r) => r.consensusCheck?.verdict === 'na')).toBe(true);
  });

  it('keeps a pre-existing oracle downgrade dishonest', () => {
    const oracleRejected = result('oracle-rejected', 100, {
      outcome: { ...result('x', 100).outcome, honest: false },
    });
    const checked = applyConsensus([oracleRejected, result('peer', 100)], 200);
    expect(checked[0].consensusCheck?.verdict).toBe('agree');
    expect(checked[0].outcome.honest).toBe(false);
  });

  it('can reject an oracle-agreeing feed when a three-provider consensus rejects it', () => {
    const oracleAgreed = result('oracle-agreed', 150, {
      oracleCheck: {
        symbol: 'BTC',
        claimed: 150,
        truth: 150,
        deviationBps: 0,
        toleranceBps: 200,
        verdict: 'agree',
      },
    });
    const checked = applyConsensus([result('a', 100), result('b', 101), oracleAgreed], 200);
    expect(checked[2].consensusCheck?.verdict).toBe('deviates');
    expect(checked[2].outcome.honest).toBe(false);
  });

  it('can reject an outlier when the oracle is unavailable', () => {
    const noOracle = result('no-oracle', 150, {
      oracleCheck: {
        symbol: 'BTC',
        claimed: null,
        truth: null,
        deviationBps: null,
        toleranceBps: 200,
        verdict: 'na',
        reason: 'oracle unavailable',
      },
    });
    const checked = applyConsensus([result('a', 100), result('b', 101), noOracle], 200);
    expect(checked[2].consensusCheck?.verdict).toBe('deviates');
    expect(checked[2].outcome.honest).toBe(false);
  });

  it('treats exactly-at-tolerance as agreement', () => {
    const checked = applyConsensus([result('a', 98), result('b', 100), result('c', 102)], 200);
    expect(checked.map((r) => r.consensusCheck?.verdict)).toEqual(['agree', 'agree', 'agree']);
  });
});
