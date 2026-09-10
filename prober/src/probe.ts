import type { ProbeTarget } from './discovery.js';
import { verifyResponse, extractPaymentRef, type ProbeOutcome } from './verify.js';
import type { Oracle, OracleCheck } from './oracle.js';

export interface ProbeResult {
  target: ProbeTarget;
  outcome: ProbeOutcome;
  paymentRef: string;
  oracleCheck?: OracleCheck;
}

export async function probeOne(
  target: ProbeTarget,
  paidFetch: typeof fetch,
  oracle?: Oracle,
): Promise<ProbeResult> {
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
  let outcome = verifyResponse({ status, body, latencyMs }, target.requiredFields);

  // Objective-data services get a second, harder test: is the number actually
  // right? Cross-check the claimed price against The Graph oracle. A feed that
  // delivered a spec-conformant but wrong price is downgraded to dishonest. The
  // oracle only ever DOWNGRADES (na/agree leave the spec verdict untouched), so
  // a missing key or unpriceable symbol can never cause a false accusation.
  let oracleCheck: OracleCheck | undefined;
  if (oracle && target.category === 'price' && outcome.delivered) {
    oracleCheck = await oracle.check(target, body);
    if (oracleCheck.verdict === 'deviates') {
      outcome = { ...outcome, honest: false };
    }
  }

  return { target, outcome, paymentRef, oracleCheck };
}
