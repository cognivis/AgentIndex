// Real market prices from The Graph's Token API (served by Pinax). This makes
// `pricefeed` a genuine service backed by live Graph data — The Graph is a real
// INPUT to the index, not canned data. Price is exposed as DEX pool OHLC; we read
// the latest daily candle for a curated USDC pool per symbol.
// See memory graph-token-api-config for endpoint details.
const BASE = process.env.TOKEN_API_BASE ?? 'https://api.pinax.network';
const NETWORK = process.env.TOKEN_API_NETWORK ?? 'mainnet';

// symbol -> most-liquid mainnet USDC pool (verified). Only symbols with a real
// on-chain market can be served truthfully.
const POOLS: Record<string, string> = {
  ETH: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640', // WETH/USDC 0.05%
  BTC: '0x9a772018fbd77fcd2d25657e5c547baff3fd7d16', // WBTC/USDC 0.05%
  LINK: '0xfad57d2039c21811c8f2b5d5b65308aa99d31559', // LINK/USDC 0.30%
};

export interface PriceQuote {
  symbol: string;
  priceUsd: number;
  change24h: number; // % change over the current day's candle
  source: string;
  asOf: string;
}

export function supportedSymbols(): string[] {
  return [...Object.keys(POOLS), 'USDC'];
}

export async function fetchPrice(symbol: string): Promise<PriceQuote | null> {
  const sym = symbol.toUpperCase();
  const nowIso = new Date().toISOString();
  if (sym === 'USDC') {
    return { symbol: sym, priceUsd: 1, change24h: 0, source: 'peg', asOf: nowIso };
  }

  const jwt = process.env.THEGRAPH_TOKEN_API_KEY;
  const pool = POOLS[sym];
  if (!jwt || !pool) return null;

  const url = `${BASE}/v1/evm/pools/ohlc?network=${NETWORK}&pool=${pool}&interval=1d&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(Number(process.env.TOKEN_API_TIMEOUT_MS ?? 15_000)),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { open?: number; close?: number; datetime?: string }[];
    };
    const c = json.data?.[0];
    if (!c || typeof c.close !== 'number' || !Number.isFinite(c.close)) return null;
    const change24h = c.open && c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    return {
      symbol: sym,
      priceUsd: c.close,
      change24h,
      source: 'thegraph-token-api',
      asOf: nowIso,
    };
  } catch {
    return null; // upstream down: the service reports unavailable, never fakes
  }
}
