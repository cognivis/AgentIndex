import { keccak256, toBytes } from 'viem';

export interface ProbeOutcome {
  delivered: boolean;
  honest: boolean;
  latencyMs: number;
  responseHash: `0x${string}`;
}

export interface ProbeResponse {
  status: number;
  body: string;
  latencyMs: number;
}

export interface PaymentReceipt {
  reference: string;
  amount: bigint;
  network: string;
}

/// A probe "delivers" if we got a 2xx with a non-empty JSON object back.
/// It's "honest" if that object also contains every field the service's
/// published spec promises. scamco delivers a 200 with junk — delivered
/// from the payment rail's perspective, dishonest from the buyer's.
export function verifyResponse(res: ProbeResponse, requiredFields: string[]): ProbeOutcome {
  const responseHash = keccak256(toBytes(res.body));
  const base = { latencyMs: res.latencyMs, responseHash };

  if (res.status < 200 || res.status >= 300) {
    return { ...base, delivered: false, honest: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return { ...base, delivered: false, honest: false };
  }

  if (parsed === null || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
    return { ...base, delivered: false, honest: false };
  }

  const obj = parsed as Record<string, unknown>;
  const honest = requiredFields.every((f) => obj[f] !== undefined && obj[f] !== null);
  return { ...base, delivered: true, honest };
}

/// Pull the Hedera transaction reference out of the x402 settle response
/// header so the attestation links back to the actual payment.
export function extractPaymentRef(headers: Headers): string {
  return extractPaymentReceipt(headers).reference;
}

/// Decode the facilitator settlement receipt. `amount` is optional in x402 v2
/// and absent in older responses, so unknown amounts stay zero rather than being
/// guessed from directory metadata.
export function extractPaymentReceipt(headers: Headers): PaymentReceipt {
  const raw = headers.get('payment-response') ?? headers.get('x-payment-response');
  if (!raw) return { reference: '', amount: 0n, network: '' };
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as {
      transaction?: unknown;
      txHash?: unknown;
      transactionId?: unknown;
      amount?: unknown;
      network?: unknown;
    };
    const reference = decoded.transaction ?? decoded.txHash ?? decoded.transactionId;
    const internalAmount = headers.get('x-agentindex-payment-amount');
    const rawAmount = typeof decoded.amount === 'string' ? decoded.amount : internalAmount;
    const amount = rawAmount && /^\d+$/.test(rawAmount) ? BigInt(rawAmount) : 0n;
    return {
      reference: typeof reference === 'string' ? reference : '',
      amount,
      network: typeof decoded.network === 'string' ? decoded.network : '',
    };
  } catch {
    return { reference: '', amount: 0n, network: '' };
  }
}
