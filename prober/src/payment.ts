import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { PrivateKey } from '@hiero-ledger/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import type { ProbeTarget } from './discovery.js';

export const BASE_NETWORK = 'eip155:8453';
export const BASE_V1_NETWORK = 'base';
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const EXPECTED_BASE_PAYER = '0x0D15fE519d8294Df04aD299AD1aD9de7a8E77Bc0';
export const BASE_MAX_PAYMENT_ATOMIC = 10_000n; // $0.01 at 6 USDC decimals
export const BASE_MAX_PAYMENT_USD = 0.01;

interface PaymentRequirementLike {
  network: string;
  asset: string;
  amount?: string;
  maxAmountRequired?: string;
}

/// Defense in depth on top of the SDK spend controls. The remote server owns
/// the 402 response, so never trust its advertised network, asset, or amount.
export function isAllowedBasePaymentRequirement(req: PaymentRequirementLike): boolean {
  if (req.network !== BASE_NETWORK && req.network !== BASE_V1_NETWORK) return false;
  if (req.asset.toLowerCase() !== BASE_USDC.toLowerCase()) return false;
  const rawAmount = req.amount ?? req.maxAmountRequired;
  if (!rawAmount || !/^\d+$/.test(rawAmount)) return false;
  return BigInt(rawAmount) <= BASE_MAX_PAYMENT_ATOMIC;
}

export function assertSafeExternalTarget(target: ProbeTarget): void {
  if (target.source !== 'external') throw new Error('Base payments are restricted to external targets');
  if (target.network !== BASE_NETWORK) {
    throw new Error(`refusing external payment on unsupported network ${target.network ?? 'unknown'}`);
  }
  if (!target.asset || target.asset.toLowerCase() !== BASE_USDC.toLowerCase()) {
    throw new Error(`refusing external payment in unsupported asset ${target.asset ?? 'unknown'}`);
  }
  if (
    target.priceUsd == null ||
    !Number.isFinite(target.priceUsd) ||
    target.priceUsd <= 0 ||
    target.priceUsd > BASE_MAX_PAYMENT_USD
  ) {
    throw new Error(`refusing external payment with unsafe advertised price ${String(target.priceUsd)}`);
  }
}

export function assertExternalRunMode(externalEnabled: boolean, once: boolean): void {
  if (externalEnabled && !once) {
    throw new Error('PROBE_EXTERNAL=1 requires --once to prevent repeated Base spending');
  }
}

/// Returns a fetch that transparently settles 402s on Hedera testnet.
/// With PAYWALL=off (services running free for local dev) plain fetch is fine.
export function createPaidFetch(): typeof fetch {
  if (process.env.PAYWALL === 'off') return globalThis.fetch;

  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error('HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are required unless PAYWALL=off');
  }

  const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(privateKey), {
    network: 'hedera:testnet',
  });

  const client = new x402Client()
    .register('hedera:testnet', new ExactHederaScheme(signer))
    // HBAR isn't a "default asset", so opt in — capped at 1 HBAR per payment
    // so a malicious 402 can't drain the prober
    .setSpendControls({
      allowedAssets: [
        { network: 'hedera:testnet', asset: '0.0.0', maxAmountPerPayment: '100000000' },
      ],
    });
  return wrapFetchWithPayment(globalThis.fetch, client);
}

/// Returns a Base-mainnet x402 client scoped to canonical USDC and capped at
/// one cent. Credentials are loaded lazily, so ordinary Hedera rounds do not
/// require a Base key and external probing remains explicitly opt-in.
export function createBasePaidFetch(target: ProbeTarget): typeof fetch {
  assertSafeExternalTarget(target);

  const privateKey = process.env.BASE_PRIVATE_KEY;
  if (!privateKey) throw new Error('BASE_PRIVATE_KEY is required for external Base probes');

  const signer = privateKeyToAccount(`0x${privateKey.replace(/^0x/, '')}`);
  if (signer.address.toLowerCase() !== EXPECTED_BASE_PAYER.toLowerCase()) {
    throw new Error(`BASE_PRIVATE_KEY must belong to the approved probe wallet ${EXPECTED_BASE_PAYER}`);
  }
  const client = new x402Client();
  let selectedAmount = 0n;
  registerExactEvmScheme(client, {
    signer,
    networks: [BASE_NETWORK],
    policies: [(_version, requirements) => requirements.filter(isAllowedBasePaymentRequirement)],
  });
  client.setSpendControls({
    maxAmountPerPayment: '$0.01',
    allowedAssets: [
      {
        network: BASE_NETWORK,
        asset: BASE_USDC,
        maxAmountPerPayment: BASE_MAX_PAYMENT_ATOMIC.toString(),
      },
    ],
  });
  client.onAfterPaymentCreation(async ({ selectedRequirements }) => {
    const requirement = selectedRequirements as PaymentRequirementLike;
    const rawAmount = requirement.amount ?? requirement.maxAmountRequired;
    selectedAmount = rawAmount && /^\d+$/.test(rawAmount) ? BigInt(rawAmount) : 0n;
  });

  const paidFetch = wrapFetchWithPayment(globalThis.fetch, client);
  return async (input, init) => {
    selectedAmount = 0n;
    const response = await paidFetch(input, init);
    if (selectedAmount === 0n) return response;
    const headers = new Headers(response.headers);
    headers.set('x-agentindex-payment-amount', selectedAmount.toString());
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/// Lazily create and cache one client per payment rail. This keeps the six
/// seeded services on Hedera while routing explicitly enabled external feeds
/// to Base without requiring credentials for an unused rail.
export function createPaidFetchRouter(): (target: ProbeTarget) => typeof fetch {
  let hederaFetch: typeof fetch | undefined;
  let baseFetch: typeof fetch | undefined;

  return (target) => {
    if (process.env.PAYWALL === 'off') return globalThis.fetch;
    if (target.source === 'external') {
      assertSafeExternalTarget(target);
      baseFetch ??= createBasePaidFetch(target);
      return baseFetch;
    }
    hederaFetch ??= createPaidFetch();
    return hederaFetch;
  };
}
