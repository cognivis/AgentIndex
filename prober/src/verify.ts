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
  const raw = headers.get('payment-response') ?? headers.get('x-payment-response');
  if (!raw) return '';
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return decoded?.transaction ?? decoded?.txHash ?? decoded?.transactionId ?? '';
  } catch {
    return '';
  }
}
