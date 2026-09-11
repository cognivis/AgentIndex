import { describe, expect, it } from 'vitest';
import type { ProbeTarget } from '../src/discovery.js';
import type { Oracle } from '../src/oracle.js';
import { probeOne } from '../src/probe.js';

const target: ProbeTarget = {
  label: 'ext:tickersfeed',
  url: 'https://api.tickersfeed.net/crypto/BTC',
  method: 'GET',
  requiredFields: ['symbol', 'name', 'market'],
  source: 'external',
  category: 'price',
  symbol: 'BTC',
  pricePath: 'market.price_usd',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  priceUsd: 0.002,
};

function paymentHeader(transaction: string): string {
  return Buffer.from(
    JSON.stringify({ success: true, transaction, network: 'eip155:8453' }),
  ).toString('base64');
}

const body = JSON.stringify({
  symbol: 'BTC',
  name: 'Bitcoin',
  market: { price_usd: 70_000 },
});

describe('probeOne external evidence', () => {
  it('keeps the selected amount and chain-qualifies a Base receipt', async () => {
    const paidFetch = async () =>
      new Response(body, {
        status: 200,
        headers: {
          'PAYMENT-RESPONSE': paymentHeader(`0x${'a'.repeat(64)}`),
          'X-AGENTINDEX-PAYMENT-AMOUNT': '2000',
          'X-AGENTINDEX-ROUND-SPEND': '4000',
          'X-AGENTINDEX-DAILY-SPEND': '6000',
        },
      });

    const result = await probeOne(target, paidFetch as typeof fetch);
    expect(result.specHonest).toBe(true);
    expect(result.outcome.honest).toBe(true);
    expect(result.amountPaid).toBe(2000n);
    expect(result.baseSpend).toEqual({ roundAtomic: 4000n, dailyAtomic: 6000n });
    expect(result.paymentRef).toBe(`base:0x${'a'.repeat(64)}`);
  });

  it('preserves spec honesty while an oracle downgrade changes final honesty', async () => {
    const paidFetch = async () => new Response(body, { status: 200 });
    const oracle: Oracle = {
      configured: true,
      priceOf: async () => 50_000,
      check: async () => ({
        symbol: 'BTC',
        claimed: 70_000,
        truth: 50_000,
        deviationBps: 4_000,
        toleranceBps: 200,
        verdict: 'deviates',
      }),
    };

    const result = await probeOne(target, paidFetch as typeof fetch, oracle);
    expect(result.specHonest).toBe(true);
    expect(result.outcome.honest).toBe(false);
    expect(result.oracleCheck?.verdict).toBe('deviates');
  });
});
