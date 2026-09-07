import type { ProbeTarget } from './discovery.js';
import { verifyResponse, extractPaymentRef, type ProbeOutcome } from './verify.js';

export interface ProbeResult {
  target: ProbeTarget;
  outcome: ProbeOutcome;
  paymentRef: string;
}

export async function probeOne(target: ProbeTarget, paidFetch: typeof fetch): Promise<ProbeResult> {
  const started = Date.now();
  let status = 0;
  let body = '';
  let paymentRef = '';

  try {
    const res = await paidFetch(target.url, {
      method: target.method,
      headers: target.body ? { 'Content-Type': 'application/json' } : undefined,
      body: target.body ? JSON.stringify(target.body) : undefined,
      signal: AbortSignal.timeout(Number(process.env.PROBE_TIMEOUT_MS ?? 15_000)),
    });
    status = res.status;
    body = await res.text();
    paymentRef = extractPaymentRef(res.headers);
  } catch {
    // timeouts and refused connections count as non-delivery
  }

  const latencyMs = Date.now() - started;
  const outcome = verifyResponse({ status, body, latencyMs }, target.requiredFields);
  return { target, outcome, paymentRef };
}
