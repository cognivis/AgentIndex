import Link from 'next/link';
import { loadService, bps, ago } from '../../../lib/data';
import { VerdictChip, ScoreMeter, Freshness, paymentReceipt, etherscan } from '../../../components/bits';
import ProbeTimeline from '../../../components/probe-timeline';
import { ExternalEvidenceCard } from '../../../components/external-evidence';
import { externalEvidenceFor } from '../../../lib/external-evidence';

export const revalidate = 15;

export default async function ServicePage({ params }: { params: Promise<{ label: string }> }) {
  const route = await params;
  let label = route.label;
  try {
    label = decodeURIComponent(label);
  } catch {
    // Leave malformed input unchanged so it produces the normal not-found view.
  }
  const { service, manifest, meta } = await loadService(label);

  if (!service) {
    return (
      <div className="wrap">
        <header className="site">
          <div className="logo">
            agent<span>index</span>
          </div>
        </header>
        <p>
          No service “{label}” in the index. <Link href="/">← back</Link>
        </p>
      </div>
    );
  }

  const externalEvidence = externalEvidenceFor(service.label, service.probes);
  const evidenceProbe = externalEvidence
    ? service.probes.find((probe) => probe.paymentRef === externalEvidence.paymentRef)
    : null;

  return (
    <div className="wrap">
      <header className="site">
        <div className="logo">
          <Link href="/">
            agent<span>index</span>
          </Link>
        </div>
        <Freshness block={meta.block.number} timestamp={meta.block.timestamp} />
      </header>

      <div className="crumb">
        <Link href="/">services</Link> / {service.label}
      </div>

      <div className="detail-head">
        <h1>{service.ensName}</h1>
        <VerdictChip verdict={service.verdict} />
      </div>
      {manifest && <p className="dim">{manifest.description}</p>}
      {manifest && (
        <div className="endpoint">
          {manifest.method} {manifest.url} · {manifest.price}/call
        </div>
      )}
      {service.delisted && (
        <p className="num-bad">Delisted: {service.delistReason ?? 'no reason recorded'}</p>
      )}
      <p className="dim">{service.verdict.reasons.join(' · ')}</p>

      {externalEvidence && evidenceProbe && (
        <ExternalEvidenceCard evidence={externalEvidence} attestationTx={evidenceProbe.txHash} />
      )}

      <div className="tiles">
        <div className="tile">
          <div className="label">Trust score</div>
          <ScoreMeter scoreBps={service.trustScoreBps} />
          <div className="sub">60% delivery · 25% honesty · 15% latency</div>
        </div>
        <div className="tile">
          <div className="label">Delivery rate</div>
          <div className="value">{bps(service.deliveryRateBps).toFixed(1)}%</div>
          <div className="sub">of paid requests returned data</div>
        </div>
        <div className="tile">
          <div className="label">Honesty rate</div>
          <div className="value">{bps(service.honestyRateBps).toFixed(1)}%</div>
          <div className="sub">responses matching claimed spec</div>
        </div>
        <div className="tile">
          <div className="label">Avg latency</div>
          <div className="value">{Number(service.avgLatencyMs).toLocaleString()}ms</div>
          <div className="sub">{service.probeCount} probes total</div>
        </div>
      </div>

      {(() => {
        // Trust = 60% delivery + 25% honesty + 15% latency. Delivery & honesty
        // arrive as rates (bps); back-solve the latency component from the
        // published blend so the breakdown reflects the real on-chain score.
        const delivery = bps(service.deliveryRateBps);
        const honesty = bps(service.honestyRateBps);
        const trust = bps(service.trustScoreBps);
        const latencyScore = Math.max(0, Math.min(100, (trust - 0.6 * delivery - 0.25 * honesty) / 0.15));
        const parts = [
          { label: 'Delivery', weight: 60, pct: delivery, note: 'returned data for paid requests' },
          { label: 'Honesty', weight: 25, pct: honesty, note: 'responses matched the claimed spec' },
          {
            label: 'Latency',
            weight: 15,
            pct: latencyScore,
            note: `scored from ${Number(service.avgLatencyMs).toLocaleString()}ms avg`,
          },
        ];
        return (
          <div className="tile" style={{ marginTop: 16 }}>
            <div className="label">Why this verdict</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {parts.map((p) => (
                <div key={p.label}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      fontSize: 13,
                      marginBottom: 4,
                    }}
                  >
                    <span>
                      {p.label}{' '}
                      <span className="dim" style={{ fontSize: 11 }}>
                        {p.weight}% of score
                      </span>
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.pct.toFixed(1)}%</span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: 'var(--grid)',
                      overflow: 'hidden',
                    }}
                    role="meter"
                    aria-label={`${p.label} ${p.pct.toFixed(1)} percent, weighted ${p.weight} percent of the trust score`}
                    aria-valuenow={Math.round(p.pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, p.pct))}%`,
                        height: '100%',
                        background: 'var(--seq)',
                      }}
                    />
                  </div>
                  <div className="dim" style={{ fontSize: 11, marginTop: 3 }}>
                    {p.note}
                  </div>
                </div>
              ))}
            </div>
            {service.verdict.reasons.length > 0 && (
              <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)' }}>
                {service.verdict.reasons.map((r, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      <ProbeTimeline probes={service.probes} />

      <h2>Probe history</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Result</th>
            <th>Latency</th>
            <th>x402 payment</th>
            <th>Attestation</th>
          </tr>
        </thead>
        <tbody>
          {service.probes.map((p, i) => (
            <tr key={i}>
              <td className="dim">{ago(Number(p.timestamp))}</td>
              <td>
                {p.delivered ? (
                  p.honest ? (
                    <span className="num-good">✓ honest</span>
                  ) : (
                    <span className="num-bad">✕ junk response</span>
                  )
                ) : (
                  <span className="num-bad">✕ no delivery</span>
                )}
              </td>
              <td className="dim">{Number(p.latencyMs).toLocaleString()}ms</td>
              <td>
                {p.paymentRef ? (() => {
                  const payment = paymentReceipt(p.paymentRef);
                  return (
                    <a className="ref" href={payment.url} target="_blank" style={{ color: 'var(--seq)', fontSize: 12 }}>
                      {payment.network} · {payment.id.slice(0, 18)}… ↗
                    </a>
                  );
                })() : <span className="dim">—</span>}
              </td>
              <td>
                <a className="ref" href={etherscan(p.txHash)} target="_blank" style={{ color: 'var(--seq)', fontSize: 12 }}>
                  {p.txHash.slice(0, 12)}… ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
