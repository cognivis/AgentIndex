import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

export function createResourceServer(): x402ResourceServer {
  const facilitatorUrl =
    process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator';

  return new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl })).register(
    'hedera:*',
    new ExactHederaScheme({}),
  );
}
