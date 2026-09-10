// The ground-truth price oracle: The Graph's Token API (now served by Pinax).
// This is the centerpiece — for objective data (a price), "honest" can't just
// mean "well-formed"; the number has to be RIGHT. We fetch the real market price
// from The Graph and cross-check what a feed claims against it. A feed that
// returns a clean, spec-conformant, but WRONG price gets caught here.
//
// There is no direct spot-price endpoint; The Graph exposes price as DEX pool
// OHLC. We read the latest 1h candle's close for a curated USDC pool per symbol.
// See memory graph-token-api-config for the endpoint details.
import type { ProbeTarget } from './discovery.js';

const BASE = process.env.TOKEN_API_BASE ?? 'https://api.pinax.network';
const NETWORK = process.env.TOKEN_API_NETWORK ?? 'mainnet';
const TOLERANCE_BPS = Number(process.env.ORACLE_TOLERANCE_BPS ?? 200); // 2% default
const PRICE_TTL_MS = Number(process.env.ORACLE_PRICE_TTL_MS ?? 60_000);

// symbol -> most-liquid USDC pool on mainnet (verified). Symbols not here (HBAR,
// SOL — not ERC-20 on mainnet) can't be priced, so their feeds fall back to
// spec-only honesty rather than a false accusation.
const POOLS: Record<string, string> = {
  ETH: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640', // WETH/USDC 0.05%
  BTC: '0x9a772018fbd77fcd2d25657e5c547baff3fd7d16', // WBTC/USDC 0.05%
  LINK: '0xfad57d2039c21811c8f2b5d5b65308aa99d31559', // LINK/USDC 0.30%
};

export type OracleVerdict = 'agree' | 'deviates' | 'na';

export interface OracleCheck {
  symbol: string;
  claimed: number | null;
  truth: number | null;
  deviationBps: number | null;
  toleranceBps: number;
  verdict: OracleVerdict;
  reason?: string;
}

export interface Oracle {
  configured: boolean;
  priceOf(symbol: string): Promise<number | null>;
  check(target: ProbeTarget, body: string): Promise<OracleCheck>;
}

// dot-path getter: "data.price" / "result.0.usd"
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function createOracle(): Oracle {
  const jwt = process.env.THEGRAPH_TOKEN_API_KEY;
  const configured = Boolean(jwt);
  const cache = new Map<string, { price: number; at: number }>();

  async function priceOf(symbol: string): Promise<number | null> {
    const sym = symbol.toUpperCase();
    if (sym === 'USDC' || sym === 'USDT' || sym === 'DAI') return 1;
    if (!configured) return null;
    const pool = POOLS[sym];
    if (!pool) return null;

    const hit = cache.get(sym);
    if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.price;

    const url = `${BASE}/v1/evm/pools/ohlc?network=${NETWORK}&pool=${pool}&interval=1h&limit=1`;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(Number(process.env.ORACLE_TIMEOUT_MS ?? 15_000)),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { close?: number }[] };
      const close = json.data?.[0]?.close;
      if (typeof close !== 'number' || !Number.isFinite(close)) return null;
      cache.set(sym, { price: close, at: Date.now() });
      return close;
    } catch {
      return null; // oracle unreachable: never converts to a false accusation
    }
  }

  async function check(target: ProbeTarget, body: string): Promise<OracleCheck> {
    const symbol = (target.symbol ?? '').toUpperCase();
    const na = (reason: string): OracleCheck => ({
      symbol,
      claimed: null,
      truth: null,
      deviationBps: null,
      toleranceBps: TOLERANCE_BPS,
      verdict: 'na',
      reason,
    });

    if (!symbol) return na('no symbol on target');
    if (!target.pricePath) return na('no pricePath on target');

    let claimed: number | null = null;
    try {
      claimed = toNumber(getPath(JSON.parse(body), target.pricePath));
    } catch {
      return na('response not JSON');
    }
    if (claimed == null) return na(`no numeric price at "${target.pricePath}"`);

    const truth = await priceOf(symbol);
    if (truth == null) return na(`no oracle price for ${symbol}`);

    const deviationBps = Math.round((Math.abs(claimed - truth) / truth) * 10_000);
    return {
      symbol,
      claimed,
      truth,
      deviationBps,
      toleranceBps: TOLERANCE_BPS,
      verdict: deviationBps > TOLERANCE_BPS ? 'deviates' : 'agree',
    };
  }

  return { configured, priceOf, check };
}
