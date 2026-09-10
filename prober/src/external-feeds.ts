// Real external x402 services, pulled from a public directory so the index rates
// the ACTUAL ecosystem — not just our seeded set. We curate price feeds because
// price is objective: their claimed number can be cross-checked against a
// ground-truth oracle (The Graph Token API) — see oracle.ts. That is the
// centerpiece: "verify a real stranger's price feed against The Graph."
//
// Source: x402-list.com — an open x402 directory with a no-auth discovery API
// (GET /api/v1/best, GET /api/v1/services/{slug}). We never trust the directory's
// own quality score; it only tells us a feed EXISTS and where to reach it. We do
// the paying and the verifying ourselves.
import type { ProbeTarget } from './discovery.js';

const DIRECTORY_BASE = process.env.X402_DIRECTORY_BASE ?? 'https://x402-list.com';
const DIRECTORY_TIMEOUT_MS = 8_000;

// Curated real feeds we know how to read: which symbol each endpoint reports and
// where the numeric price sits in its JSON. Discovery gives us the URL; this map
// gives us the two things a directory can't: what the number MEANS and where it
// is. Start deterministic (one A-grade feed); the live query below widens it.
interface FeedAdapter {
  slug: string; // x402-list.com slug, for enrichment + provenance
  symbol: string; // asset the feed reports, uppercased ticker
  // dot-path to the numeric USD price in the response body; the oracle reads it
  pricePath: string;
  // response keys we require to call the shape "delivered as promised"
  requiredFields: string[];
}

const CURATED: FeedAdapter[] = [
  // TickersFeed — Finance, GET /crypto/1, $0.002 USDC on Base, 100% uptime (grade A).
  // The single real feed we pay for real (item 1h). pricePath/requiredFields are
  // best-effort until first paid read confirms the exact shape; the oracle treats
  // a missing path as "can't verify", never as "dishonest", so a wrong guess here
  // downgrades to verify-light rather than falsely accusing the feed.
  { slug: 'tickersfeed', symbol: 'BTC', pricePath: 'price', requiredFields: ['price'] },
];

interface DirectoryPricing {
  network_caip2?: string;
  asset_address?: string;
  price_usd?: number;
  pay_to?: string;
}
interface DirectoryEndpoint {
  method?: string;
  path?: string;
  pricing?: DirectoryPricing[];
}
interface DirectoryDetail {
  slug?: string;
  name?: string;
  category?: string;
  base_url?: string;
  endpoints?: DirectoryEndpoint[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DIRECTORY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // directory down / slow: fall back to curated, never throw
  } finally {
    clearTimeout(t);
  }
}

// Enrich a curated feed into a probeable target by resolving its live base_url +
// endpoint path from the directory. If enrichment fails we skip the feed rather
// than probe a guessed URL.
async function toTarget(feed: FeedAdapter): Promise<ProbeTarget | null> {
  const detail = await fetchJson<DirectoryDetail>(
    `${DIRECTORY_BASE}/api/v1/services/${feed.slug}`,
  );
  if (!detail?.base_url) return null;

  // prefer a GET endpoint (cheap to probe); else take the first
  const endpoints = detail.endpoints ?? [];
  const ep = endpoints.find((e) => (e.method ?? 'GET').toUpperCase() === 'GET') ?? endpoints[0];
  if (!ep?.path) return null;

  const pricing = ep.pricing?.[0];
  const url = `${detail.base_url.replace(/\/$/, '')}${ep.path}`;

  return {
    label: `ext:${feed.slug}`,
    url,
    method: (ep.method ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET',
    requiredFields: feed.requiredFields,
    source: 'external',
    category: 'price',
    symbol: feed.symbol,
    pricePath: feed.pricePath,
    network: pricing?.network_caip2,
    priceUsd: pricing?.price_usd,
    slug: feed.slug,
  };
}

// The public entrypoint: resolve curated real feeds into probe targets. Best-effort
// and non-fatal — a directory outage yields an empty list, and the prober simply
// runs its ENS-registered targets that round.
export async function discoverExternalFeeds(): Promise<ProbeTarget[]> {
  const targets = await Promise.all(CURATED.map(toTarget));
  return targets.filter((t): t is ProbeTarget => t !== null);
}

// Which curated feeds we'd pay real money on (item 1h): only Base-USDC feeds under
// a cent, so the "paid a real stranger, caught a liar" moment stays a few cents.
export function isCheapBaseFeed(t: ProbeTarget): boolean {
  return (
    t.source === 'external' &&
    (t.network?.startsWith('eip155:8453') ?? false) &&
    (t.priceUsd ?? Infinity) <= 0.01
  );
}
