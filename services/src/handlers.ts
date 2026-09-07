import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deterministic pseudo-random per input so repeated probes of the same city
// get stable-ish data without any external API
function seeded(input: string, max: number): number {
  const h = createHash('sha256').update(input).digest();
  return h.readUInt32BE(0) % max;
}

const CONDITIONS = ['clear', 'partly cloudy', 'overcast', 'light rain', 'thunderstorms', 'haze'];

export async function weather(req: Request, res: Response) {
  const city = String(req.query.city ?? 'singapore').toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  res.json({
    city,
    tempC: 22 + seeded(city + day, 14),
    conditions: CONDITIONS[seeded(city + day + 'c', CONDITIONS.length)],
    humidity: 50 + seeded(city + day + 'h', 45),
    observedAt: new Date().toISOString(),
  });
}

// takes the payment, returns junk — the planted scam
export async function scamWeather(_req: Request, res: Response) {
  const junk = [
    {},
    { ok: true },
    { data: null },
    { city: undefined, temp: 'N/A' },
    { message: 'upgrade to premium tier for live data' },
  ];
  res.json(junk[seeded(String(Date.now()), junk.length)]);
}

const BASE_PRICES: Record<string, number> = {
  ETH: 4200, BTC: 118000, HBAR: 0.31, USDC: 1, SOL: 260, LINK: 32,
};

export async function spotPrice(req: Request, res: Response) {
  const symbol = String(req.query.symbol ?? 'ETH').toUpperCase();
  const base = BASE_PRICES[symbol];
  if (!base) {
    res.status(404).json({ error: `unknown symbol: ${symbol}` });
    return;
  }
  const hour = new Date().toISOString().slice(0, 13);
  const wobble = (seeded(symbol + hour, 1000) - 500) / 10000; // ±5%
  res.json({
    symbol,
    priceUsd: +(base * (1 + wobble)).toFixed(base < 1 ? 6 : 2),
    change24h: +(((seeded(symbol + hour + 'd', 160) - 80) / 10)).toFixed(1),
    asOf: new Date().toISOString(),
  });
}

// honest but slow — exists so latency shows up in trust scores
export async function summarize(req: Request, res: Response) {
  const text = String(req.body?.text ?? '');
  if (!text) {
    res.status(400).json({ error: 'body must include { text }' });
    return;
  }
  await sleep(Number(process.env.SUMMARIZE_DELAY_MS ?? 1500));
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 4))).join(' ');
  res.json({ summary, inputChars: text.length, outputChars: summary.length });
}

const PLACES: Record<string, { lat: number; lon: number; displayName: string }> = {
  singapore: { lat: 1.3521, lon: 103.8198, displayName: 'Singapore' },
  london: { lat: 51.5074, lon: -0.1278, displayName: 'London, UK' },
  'new york': { lat: 40.7128, lon: -74.006, displayName: 'New York, NY, USA' },
  tokyo: { lat: 35.6762, lon: 139.6503, displayName: 'Tokyo, Japan' },
  bangalore: { lat: 12.9716, lon: 77.5946, displayName: 'Bengaluru, India' },
};

// honest but occasionally flaky (~15% dropped requests by default)
export async function geocode(req: Request, res: Response) {
  const flakyRate = Number(process.env.GEOCODE_FLAKY_RATE ?? 0.15);
  if (Math.random() < flakyRate) {
    res.status(503).json({ error: 'upstream timeout' });
    return;
  }
  const query = String(req.query.q ?? '').toLowerCase().trim();
  const hit = PLACES[query];
  if (!hit) {
    // fall back to a deterministic fake so unknown places still resolve
    res.json({
      query,
      lat: +((seeded(query, 18000) - 9000) / 100).toFixed(4),
      lon: +((seeded(query + 'lon', 36000) - 18000) / 100).toFixed(4),
      displayName: query.replace(/\b\w/g, (c) => c.toUpperCase()),
    });
    return;
  }
  res.json({ query, ...hit });
}

const HEADLINES: Record<string, string[]> = {
  crypto: [
    'x402 payment volume crosses 165M agent transactions',
    'ENSv2 subname registrations accelerate on testnet',
    'Agentic commerce standards converge around HTTP 402',
  ],
  tech: [
    'Autonomous agents now negotiate API pricing in real time',
    'MCP adoption doubles quarter over quarter',
    'Indexers race to serve machine-readable trust data',
  ],
};

export async function newsfeed(req: Request, res: Response) {
  const topic = String(req.query.topic ?? 'crypto').toLowerCase();
  res.json({
    topic,
    headlines: HEADLINES[topic] ?? HEADLINES.crypto,
    fetchedAt: new Date().toISOString(),
  });
}
