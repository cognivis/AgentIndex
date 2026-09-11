import type { ProbeTarget } from './discovery.js';
import { verifyResponse, extractPaymentReceipt, type ProbeOutcome } from './verify.js';
import type { Oracle, OracleCheck } from './oracle.js';

export interface ProbeResult {
  target: ProbeTarget;
  outcome: ProbeOutcome;
  specHonest: boolean;
  body: string;
  paymentRef: string;
  amountPaid: bigint;
  baseSpend?: { roundAtomic: bigint; dailyAtomic: bigint };
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
  let amountPaid = 0n;
  let baseSpend: ProbeResult['baseSpend'];

  try {
    const res = await paidFetch(target.url, {
      method: target.method,
      headers: target.body ? { 'Content-Type': 'application/json' } : undefined,
      body: target.body ? JSON.stringify(target.body) : undefined,
      signal: AbortSignal.timeout(Number(process.env.PROBE_TIMEOUT_MS ?? 15_000)),
    });
    status = res.status;
    body = await res.text();
    const receipt = extractPaymentReceipt(res.headers);
    paymentRef = receipt.reference;
    amountPaid = receipt.amount;
    const roundSpend = res.headers.get('x-agentindex-round-spend');
    const dailySpend = res.headers.get('x-agentindex-daily-spend');
    if (roundSpend && dailySpend && /^\d+$/.test(roundSpend) && /^\d+$/.test(dailySpend)) {
      baseSpend = { roundAtomic: BigInt(roundSpend), dailyAtomic: BigInt(dailySpend) };
    }
    if (paymentRef && target.network === 'eip155:8453') paymentRef = `base:${paymentRef}`;
    if (!paymentRef) amountPaid = 0n;
  } catch {
    // timeouts and refused connections count as non-delivery
  }

  const latencyMs = Date.now() - started;
  let outcome = verifyResponse({ status, body, latencyMs }, target.requiredFields);
  const specHonest = outcome.honest;

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

  return { target, outcome, specHonest, body, paymentRef, amountPaid, baseSpend, oracleCheck };
}
