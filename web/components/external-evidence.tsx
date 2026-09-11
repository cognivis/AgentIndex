import type { ExternalEvidence } from '../lib/external-evidence';

export function ExternalEvidenceBadges({ evidence }: { evidence: ExternalEvidence }) {
  return (
    <span className="external-badges" aria-label="Verified external x402 service">
      <span className="external-badge">real x402</span>
      <span className="external-badge graph">Graph-verified</span>
      <span className="external-badge neutral">consensus: {evidence.consensusVerdict}</span>
    </span>
  );
}

export function ExternalEvidenceCard({
  evidence,
  attestationTx,
}: {
  evidence: ExternalEvidence;
  attestationTx: string;
}) {
  const paymentTx = evidence.paymentRef.slice('base:'.length);
  return (
    <section className="external-evidence-card">
      <div>
        <div className="label">External verification receipt</div>
        <h2>{evidence.symbol} price checked against The Graph</h2>
        <ExternalEvidenceBadges evidence={evidence} />
      </div>
      <dl>
        <div>
          <dt>Feed claimed</dt>
          <dd>${evidence.claimed.toLocaleString(undefined, { maximumFractionDigits: 4 })}</dd>
        </div>
        <div>
          <dt>Graph oracle</dt>
          <dd>${evidence.truth.toLocaleString(undefined, { maximumFractionDigits: 4 })}</dd>
        </div>
        <div>
          <dt>Deviation</dt>
          <dd>{evidence.deviationBps} bps · pass</dd>
        </div>
        <div>
          <dt>Consensus</dt>
          <dd>{evidence.consensusVerdict} · {evidence.providerCount} providers</dd>
        </div>
      </dl>
      <p className="dim">
        The two providers differed, so consensus stayed neutral; the independent Graph oracle
        agreed within the 2% tolerance.
      </p>
      <div className="external-evidence-links">
        <a href={`https://basescan.org/tx/${paymentTx}`} target="_blank" rel="noreferrer">
          Base USDC payment ↗
        </a>
        <a href={`https://sepolia.etherscan.io/tx/${attestationTx}`} target="_blank" rel="noreferrer">
          Sepolia attestation ↗
        </a>
      </div>
    </section>
  );
}
