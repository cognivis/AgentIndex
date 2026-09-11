import type { ProbeRow } from '../../mcp/src/subgraph';

export const TICKERSFEED_PAYMENT_REF =
  'base:0xac1531426573cd9a72e890dc386c664411c36feb5b31f8d83e717aa46f8f713d';

export interface ExternalEvidence {
  serviceLabel: string;
  symbol: string;
  claimed: number;
  truth: number;
  deviationBps: number;
  oracleVerdict: 'agree';
  consensusVerdict: 'split';
  providerCount: number;
  paymentRef: string;
}

export const TICKERSFEED_EVIDENCE: ExternalEvidence = {
  serviceLabel: 'ext:tickersfeed',
  symbol: 'BTC',
  claimed: 79_351.27526184893,
  truth: 79_082.47538311973,
  deviationBps: 34,
  oracleVerdict: 'agree',
  consensusVerdict: 'split',
  providerCount: 2,
  paymentRef: TICKERSFEED_PAYMENT_REF,
};

export function externalEvidenceFor(
  serviceLabel: string,
  probes: Pick<ProbeRow, 'paymentRef' | 'valid'>[],
): ExternalEvidence | null {
  if (serviceLabel !== TICKERSFEED_EVIDENCE.serviceLabel) return null;
  return probes.some(
    (probe) => probe.valid && probe.paymentRef === TICKERSFEED_EVIDENCE.paymentRef,
  )
    ? TICKERSFEED_EVIDENCE
    : null;
}
