import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { PrivateKey } from '@hiero-ledger/sdk';

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
