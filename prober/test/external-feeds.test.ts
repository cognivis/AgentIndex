import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverExternalFeeds } from '../src/external-feeds.js';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EXTERNAL_FEED_ALLOWLIST;
});

describe('discoverExternalFeeds', () => {
  it('unwraps the live directory envelope and builds the TickersFeed adapter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              slug: 'tickersfeed',
              name: 'TickersFeed',
              base_url: 'https://api.tickersfeed.net',
              endpoints: [
                {
                  method: 'GET',
                  path: '/crypto/1',
                  pricing: [
                    {
                      network_caip2: 'eip155:8453',
                      asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                      price_usd: '0.0020000000',
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(discoverExternalFeeds()).resolves.toEqual([
      expect.objectContaining({
        label: 'ext:tickersfeed',
        url: 'https://api.tickersfeed.net/crypto/BTC',
        symbol: 'BTC',
        pricePath: 'market.price_usd',
        requiredFields: ['symbol', 'name', 'market'],
        network: 'eip155:8453',
        priceUsd: 0.002,
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      }),
    ]);
  });

  it('fails closed when the directory cannot provide an endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await expect(discoverExternalFeeds()).resolves.toEqual([]);
  });

  it('adds a second objective provider only through explicit opt-in', async () => {
    process.env.EXTERNAL_FEED_ALLOWLIST = 'onchain-query-api';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              slug: 'onchain-query-api',
              base_url: 'https://chain.cyberwarex.com',
              endpoints: [
                {
                  method: 'GET',
                  path: '/ens',
                  pricing: [{ network_caip2: 'eip155:8453', price_usd: '0.003' }],
                },
                {
                  method: 'GET',
                  path: '/price',
                  pricing: [
                    {
                      network_caip2: 'eip155:8453',
                      asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                      price_usd: '0.002',
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(discoverExternalFeeds()).resolves.toEqual([
      expect.objectContaining({
        label: 'ext:onchain-query-api',
        url: 'https://chain.cyberwarex.com/price?query=BTC',
        symbol: 'BTC',
        pricePath: 'price_usd',
        requiredFields: ['query', 'price_usd', 'source'],
        priceUsd: 0.002,
      }),
    ]);
  });

  it('rejects unknown provider opt-ins instead of probing arbitrary slugs', async () => {
    process.env.EXTERNAL_FEED_ALLOWLIST = 'not-curated';
    await expect(discoverExternalFeeds()).rejects.toThrow(/unknown EXTERNAL_FEED_ALLOWLIST/);
  });
});
