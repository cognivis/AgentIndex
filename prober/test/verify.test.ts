import { describe, expect, it } from 'vitest';
import { verifyResponse, extractPaymentRef, extractPaymentReceipt } from '../src/verify.js';

const WEATHER_FIELDS = ['city', 'tempC', 'conditions', 'humidity', 'observedAt'];

const goodBody = JSON.stringify({
  city: 'singapore',
  tempC: 29,
  conditions: 'partly cloudy',
  humidity: 78,
  observedAt: '2026-09-07T10:00:00Z',
});

describe('verifyResponse', () => {
  it('marks a spec-conformant 200 as delivered and honest', () => {
    const out = verifyResponse({ status: 200, body: goodBody, latencyMs: 120 }, WEATHER_FIELDS);
    expect(out.delivered).toBe(true);
    expect(out.honest).toBe(true);
    expect(out.latencyMs).toBe(120);
    expect(out.responseHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('marks junk 200s as delivered but dishonest (the scamco case)', () => {
    const out = verifyResponse(
      { status: 200, body: '{"message":"upgrade to premium tier"}', latencyMs: 80 },
      WEATHER_FIELDS,
    );
    expect(out.delivered).toBe(true);
    expect(out.honest).toBe(false);
  });

  it('treats empty objects as non-delivery', () => {
    const out = verifyResponse({ status: 200, body: '{}', latencyMs: 50 }, WEATHER_FIELDS);
    expect(out.delivered).toBe(false);
  });

  it('treats non-2xx as non-delivery', () => {
    const out = verifyResponse({ status: 503, body: goodBody, latencyMs: 30 }, WEATHER_FIELDS);
    expect(out.delivered).toBe(false);
    expect(out.honest).toBe(false);
  });

  it('treats unparseable bodies as non-delivery', () => {
    const out = verifyResponse({ status: 200, body: '<html>oops</html>', latencyMs: 10 }, WEATHER_FIELDS);
    expect(out.delivered).toBe(false);
  });

  it('treats null spec fields as missing', () => {
    const body = JSON.stringify({ city: 'x', tempC: null, conditions: 'y', humidity: 1, observedAt: 'z' });
    const out = verifyResponse({ status: 200, body, latencyMs: 10 }, WEATHER_FIELDS);
    expect(out.delivered).toBe(true);
    expect(out.honest).toBe(false);
  });

  it('hashes are stable for identical bodies and differ otherwise', () => {
    const a = verifyResponse({ status: 200, body: goodBody, latencyMs: 1 }, WEATHER_FIELDS);
    const b = verifyResponse({ status: 200, body: goodBody, latencyMs: 2 }, WEATHER_FIELDS);
    const c = verifyResponse({ status: 200, body: '{"other":1}', latencyMs: 1 }, WEATHER_FIELDS);
    expect(a.responseHash).toBe(b.responseHash);
    expect(a.responseHash).not.toBe(c.responseHash);
  });
});

describe('extractPaymentRef', () => {
  it('decodes the settle response header', () => {
    const payload = Buffer.from(
      JSON.stringify({ success: true, transaction: '0.0.1234@1757000000.000000001' }),
    ).toString('base64');
    const headers = new Headers({ 'PAYMENT-RESPONSE': payload });
    expect(extractPaymentRef(headers)).toBe('0.0.1234@1757000000.000000001');
  });

  it('falls back to the x- prefixed header', () => {
    const payload = Buffer.from(JSON.stringify({ txHash: '0xabc' })).toString('base64');
    const headers = new Headers({ 'X-PAYMENT-RESPONSE': payload });
    expect(extractPaymentRef(headers)).toBe('0xabc');
  });

  it('returns empty string when absent or malformed', () => {
    expect(extractPaymentRef(new Headers())).toBe('');
    expect(extractPaymentRef(new Headers({ 'PAYMENT-RESPONSE': '!!!not-base64-json' }))).toBe('');
  });

  it('extracts optional amount and network without guessing missing values', () => {
    const payload = Buffer.from(
      JSON.stringify({ transaction: '0xabc', amount: '2000', network: 'eip155:8453' }),
    ).toString('base64');
    expect(extractPaymentReceipt(new Headers({ 'PAYMENT-RESPONSE': payload }))).toEqual({
      reference: '0xabc',
      amount: 2000n,
      network: 'eip155:8453',
    });
    expect(extractPaymentReceipt(new Headers())).toEqual({ reference: '', amount: 0n, network: '' });
  });

  it('uses the locally captured selected amount when exact settlement omits it', () => {
    const payload = Buffer.from(
      JSON.stringify({ transaction: '0xdef', network: 'eip155:8453' }),
    ).toString('base64');
    expect(
      extractPaymentReceipt(
        new Headers({
          'PAYMENT-RESPONSE': payload,
          'X-AGENTINDEX-PAYMENT-AMOUNT': '2000',
        }),
      ),
    ).toEqual({ reference: '0xdef', amount: 2000n, network: 'eip155:8453' });
  });
});
