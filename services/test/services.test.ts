import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { services, findService } from '../src/catalog.js';

// paywall off: these tests cover the business logic; payment flow is
// exercised end-to-end by the prober against a running instance
const app = buildApp({ paywall: false });

beforeAll(() => {
  process.env.SUMMARIZE_DELAY_MS = '0';
  process.env.GEOCODE_FLAKY_RATE = '0';
});

function hasFields(body: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((f) => body[f] !== undefined && body[f] !== null);
}

describe('catalog', () => {
  it('defines six services with unique labels and paths', () => {
    expect(services).toHaveLength(6);
    expect(new Set(services.map((s) => s.label)).size).toBe(6);
    expect(new Set(services.map((s) => s.path)).size).toBe(6);
  });

  it('scamco claims the same spec as weatherpro', () => {
    expect(findService('scamco')!.spec).toEqual(findService('weatherpro')!.spec);
  });
});

describe('weatherpro', () => {
  it('returns spec-conformant weather', async () => {
    const res = await request(app).get('/weatherpro/current?city=singapore');
    expect(res.status).toBe(200);
    expect(hasFields(res.body, findService('weatherpro')!.spec.requiredFields)).toBe(true);
    expect(res.body.city).toBe('singapore');
    expect(res.body.tempC).toBeGreaterThan(0);
  });

  it('is deterministic within a day for the same city', async () => {
    const a = await request(app).get('/weatherpro/current?city=london');
    const b = await request(app).get('/weatherpro/current?city=london');
    expect(a.body.tempC).toBe(b.body.tempC);
    expect(a.body.conditions).toBe(b.body.conditions);
  });
});

describe('scamco', () => {
  it('returns 200 but violates its own claimed spec', async () => {
    const res = await request(app).get('/scamco/current?city=singapore');
    expect(res.status).toBe(200);
    expect(hasFields(res.body, findService('scamco')!.spec.requiredFields)).toBe(false);
  });
});

describe('pricefeed', () => {
  it('returns a spot price for known symbols', async () => {
    const res = await request(app).get('/pricefeed/spot?symbol=eth');
    expect(res.status).toBe(200);
    expect(hasFields(res.body, findService('pricefeed')!.spec.requiredFields)).toBe(true);
    expect(res.body.symbol).toBe('ETH');
    expect(res.body.priceUsd).toBeGreaterThan(0);
  });

  it('404s on unknown symbols', async () => {
    const res = await request(app).get('/pricefeed/spot?symbol=NOPE');
    expect(res.status).toBe(404);
  });
});

describe('summarize', () => {
  it('summarizes text and reports sizes', async () => {
    const text =
      'First sentence here. Second one follows. Third adds detail. Fourth wraps up. Fifth is extra.';
    const res = await request(app).post('/summarize').send({ text });
    expect(res.status).toBe(200);
    expect(hasFields(res.body, findService('summarize')!.spec.requiredFields)).toBe(true);
    expect(res.body.inputChars).toBe(text.length);
    expect(res.body.outputChars).toBeLessThan(text.length);
  });

  it('rejects empty input', async () => {
    const res = await request(app).post('/summarize').send({});
    expect(res.status).toBe(400);
  });
});

describe('geocode', () => {
  it('resolves known places', async () => {
    const res = await request(app).get('/geocode/lookup?q=singapore');
    expect(res.status).toBe(200);
    expect(res.body.lat).toBeCloseTo(1.3521);
    expect(res.body.lon).toBeCloseTo(103.8198);
  });

  it('still resolves unknown places deterministically', async () => {
    const a = await request(app).get('/geocode/lookup?q=atlantis');
    const b = await request(app).get('/geocode/lookup?q=atlantis');
    expect(a.status).toBe(200);
    expect(hasFields(a.body, findService('geocode')!.spec.requiredFields)).toBe(true);
    expect(a.body.lat).toBe(b.body.lat);
  });
});

describe('newsfeed', () => {
  it('returns headlines for a topic', async () => {
    const res = await request(app).get('/newsfeed/top?topic=tech');
    expect(res.status).toBe(200);
    expect(hasFields(res.body, findService('newsfeed')!.spec.requiredFields)).toBe(true);
    expect(res.body.headlines.length).toBeGreaterThan(0);
  });
});

describe('free endpoints', () => {
  it('serves specs without payment', async () => {
    for (const svc of services) {
      const res = await request(app).get(`/${svc.label}/spec`);
      expect(res.status).toBe(200);
      expect(res.body.spec.requiredFields).toEqual(svc.spec.requiredFields);
    }
  });

  it('health lists all services', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(6);
    expect(res.body.paywall).toBe(false);
  });
});
