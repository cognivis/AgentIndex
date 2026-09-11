import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverExternalFeeds } from '../src/external-feeds.js';

afterEach(() => vi.unstubAllGlobals());

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
});
