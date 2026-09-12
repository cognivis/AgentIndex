import Link from 'next/link';
import { loadOverview, bps, ago } from '../../lib/data';
import { VerdictChip, ScoreMeter, Freshness, paymentReceipt, etherscan } from '../../components/bits';
import { ExternalEvidenceBadges } from '../../components/external-evidence';
import { externalEvidenceFor } from '../../lib/external-evidence';

// This is a live evidence view backed by the subgraph. Rendering per request
// also avoids baking stale trust data into a deployment artifact.
export const dynamic = 'force-dynamic';

// The Evidence: every verdict on the site traces back to these real paid
// probes and their on-chain receipts. Moved off `/` so the Playground can
// lead; this page is where a skeptic comes to check our work.
export default async function IndexPage() {
  const { services, stats, feed, verifiedExternalProbes, meta } = await loadOverview();
  const active = services.filter((s) => !s.delisted);

  return (
    <div className="wrap">
      <header className="site">
        <div className="logo">
          agent<span>index</span>
        </div>
        <Freshness block={meta.block.number} timestamp={meta.block.timestamp} />
      </header>

      <div className="tiles">
        <div className="tile">
          <div className="label">Registered services</div>
          <div className="value">{stats?.serviceCount ?? '—'}</div>
          <div className="sub">{stats?.activeServiceCount ?? '—'} active</div>
        </div>
        <div className="tile">
          <div className="label">Paid probes</div>
          <div className="value">{Number(stats?.probeCount ?? 0).toLocaleString()}</div>
          <div className="sub">every probe = a real x402 payment</div>
        </div>
        <div className="tile">
          <div className="label">Last probe</div>
          <div className="value">{stats ? ago(Number(stats.lastProbeAt)) : '—'}</div>
          <div className="sub">prober runs continuously</div>
        </div>
        <div className="tile">
          <div className="label">Flagged services</div>
          <div className="value">
            {active.filter((s) => s.verdict.recommendation === 'avoid').length}
          </div>
          <div className="sub">recommended avoid</div>
        </div>
      </div>

      <h2>Services</h2>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Trust score</th>
            <th>Delivery</th>
            <th>Honesty</th>
            <th>Latency</th>
            <th>Probes</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => {
            const evidence = externalEvidenceFor(
              s.label,
              verifiedExternalProbes.filter((probe) => probe.service.label === s.label),
            );
            return (
            <tr key={s.id} className="rowlink">
              <td className="svc">
                <Link href={`/service/${s.label}`}>
                  {s.label}
                  <div className="ens">{s.ensName}</div>
                  {evidence && <ExternalEvidenceBadges evidence={evidence} />}
                </Link>
              </td>
              <td>
                <ScoreMeter scoreBps={s.trustScoreBps} />
              </td>
              <td className={bps(s.deliveryRateBps) < 50 ? 'num-bad' : undefined}>
                {bps(s.deliveryRateBps).toFixed(1)}%
              </td>
              <td className={bps(s.honestyRateBps) < 50 ? 'num-bad' : undefined}>
                {bps(s.honestyRateBps).toFixed(1)}%
              </td>
              <td className="dim">{Number(s.avgLatencyMs).toLocaleString()}ms</td>
              <td className="dim">{s.probeCount}</td>
              <td>
                <VerdictChip verdict={s.verdict} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Live probe feed</h2>
      <div className="feed">
        {feed.map((p, i) => {
          const evidence = externalEvidenceFor(p.service.label, [p]);
          return (
          <div className="row" key={i}>
            <div className="svc">
              {p.service.label}
              {evidence && <ExternalEvidenceBadges evidence={evidence} />}
            </div>
            <div>
              {p.delivered ? (
                p.honest ? (
                  <span className="num-good">✓ delivered, matches spec</span>
                ) : (
                  <span className="num-bad">✕ paid, got junk back</span>
                )
              ) : (
                <span className="num-bad">✕ paid, nothing usable</span>
              )}
            </div>
            <div className="dim">{Number(p.latencyMs).toLocaleString()}ms</div>
            <div className="dim">{ago(Number(p.timestamp))}</div>
            <div>
              {p.paymentRef ? (() => {
                const payment = paymentReceipt(p.paymentRef);
                return (
                  <a className="ref" href={payment.url} target="_blank">
                    {payment.label} ↗
                  </a>
                );
              })() : <span className="dim">—</span>}{' '}
              <a className="ref" href={etherscan(p.txHash)} target="_blank">
                attest ↗
              </a>
            </div>
          </div>
          );
        })}
      </div>

      <footer className="site">
        <span>trust from receipts, not reviews</span>
        <a href="https://github.com/cognivis/AgentIndex" target="_blank">
          github
        </a>
        <a
          href="https://sepolia.etherscan.io/address/0x33406801acD2A16549462153261A224F779768CC"
          target="_blank"
        >
          attestation contract
        </a>
      </footer>
    </div>
  );
}
