import type { ProbeRow } from '../../mcp/src/subgraph';

export const TICKERSFEED_PAYMENT_REF =
  'base:0x6e88906dcd1323811582e8a2683329a81efa1a964ba922dfdbedfe2a4f7d6e47';

export interface ExternalEvidence {
  serviceLabel: string;
  symbol: string;
  claimed: number;
  truth: number;
  deviationBps: number;
  oracleVerdict: 'agree';
  consensusVerdict: 'agree' | 'split';
  providerCount: number;
  paymentRef: string;
}

export const TICKERSFEED_EVIDENCE: ExternalEvidence = {
  serviceLabel: 'ext:tickersfeed',
  symbol: 'BTC',
  claimed: 77_151.76784636136,
  truth: 77_219.60034294006,
  deviationBps: 9,
  oracleVerdict: 'agree',
  consensusVerdict: 'agree',
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
