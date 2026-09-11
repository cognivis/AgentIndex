import { describe, expect, it } from 'vitest';
import type { ProbeTarget } from '../src/discovery.js';
import {
  BASE_NETWORK,
  BASE_USDC,
  assertExternalRunMode,
  assertSafeExternalTarget,
  isAllowedBasePaymentRequirement,
} from '../src/payment.js';

const target = (overrides: Partial<ProbeTarget> = {}): ProbeTarget => ({
  label: 'ext:tickersfeed',
  url: 'https://example.test/price',
  method: 'GET',
  requiredFields: ['price'],
  source: 'external',
  network: BASE_NETWORK,
  priceUsd: 0.002,
  asset: BASE_USDC,
  ...overrides,
});

describe('Base external-payment safety', () => {
  it('requires external probing to use the one-shot runner', () => {
    expect(() => assertExternalRunMode(true, true)).not.toThrow();
    expect(() => assertExternalRunMode(false, false)).not.toThrow();
    expect(() => assertExternalRunMode(true, false)).toThrow(/--once/);
  });

  it('allows only opted-in Base external targets priced at or below one cent', () => {
    expect(() => assertSafeExternalTarget(target())).not.toThrow();
    expect(() => assertSafeExternalTarget(target({ priceUsd: 0.01 }))).not.toThrow();
  });

  it('rejects wrong source, network, asset, missing price, and excessive price', () => {
    expect(() => assertSafeExternalTarget(target({ source: 'ens' }))).toThrow();
    expect(() => assertSafeExternalTarget(target({ network: 'eip155:1' }))).toThrow();
    expect(() => assertSafeExternalTarget(target({ asset: undefined }))).toThrow();
    expect(() =>
      assertSafeExternalTarget(target({ asset: '0x0000000000000000000000000000000000000000' })),
    ).toThrow();
    expect(() => assertSafeExternalTarget(target({ priceUsd: undefined }))).toThrow();
    expect(() => assertSafeExternalTarget(target({ priceUsd: 0.010001 }))).toThrow();
  });

  it('accepts canonical Base USDC at no more than 10,000 atomic units', () => {
    expect(
      isAllowedBasePaymentRequirement({
        network: BASE_NETWORK,
        asset: BASE_USDC,
        amount: '10000',
      }),
    ).toBe(true);
  });

  it('supports v1 Base amount fields without weakening the cap', () => {
    expect(
      isAllowedBasePaymentRequirement({
        network: 'base',
        asset: BASE_USDC,
        maxAmountRequired: '2000',
      }),
    ).toBe(true);
  });

  it('rejects another network, token, malformed amount, and over-cap amount', () => {
    expect(
      isAllowedBasePaymentRequirement({ network: 'eip155:1', asset: BASE_USDC, amount: '1' }),
    ).toBe(false);
    expect(
      isAllowedBasePaymentRequirement({
        network: BASE_NETWORK,
        asset: '0x0000000000000000000000000000000000000000',
        amount: '1',
      }),
    ).toBe(false);
    expect(
      isAllowedBasePaymentRequirement({ network: BASE_NETWORK, asset: BASE_USDC, amount: '$0.002' }),
    ).toBe(false);
    expect(
      isAllowedBasePaymentRequirement({ network: BASE_NETWORK, asset: BASE_USDC, amount: '10001' }),
    ).toBe(false);
  });
});
