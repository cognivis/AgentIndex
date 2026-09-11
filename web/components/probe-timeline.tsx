'use client';

import { useState } from 'react';
import type { ProbeRow } from '../../mcp/src/subgraph';
import { paymentReceipt, etherscan } from './bits';
import styles from './probe-timeline.module.css';

type Outcome = 'good' | 'junk' | 'nodelivery';

function outcomeOf(p: ProbeRow): Outcome {
  if (!p.delivered) return 'nodelivery';
  return p.honest ? 'good' : 'junk';
}

const OUTCOME: Record<Outcome, { label: string; icon: string; cls: string }> = {
  good: { label: 'honest', icon: '✓', cls: styles.good },
  junk: { label: 'paid but junk', icon: '✕', cls: styles.junk },
  nodelivery: { label: 'no delivery', icon: '✕', cls: styles.nodelivery },
};

// Chart geometry (viewBox units; scales responsively to 100% width).
const MARK_W = 8;
const GAP = 2;
const PAD_X = 4;
const TOP = 10;
const BASE_Y = 90; // baseline
const MIN_H = 10;
const MAX_H = BASE_Y - TOP; // tallest bar

function ago(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ProbeTimeline({ probes }: { probes: ProbeRow[] }) {
  const [active, setActive] = useState<number | null>(null);

  // Data arrives newest-first; render oldest → newest (left → right).
  const chrono = [...probes].reverse();

  if (chrono.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.head}>
          <h2 style={{ margin: 0 }}>Probe timeline</h2>
        </div>
        <p className={styles.empty}>No probes recorded yet.</p>
      </div>
    );
  }

  const latencies = chrono.map((p) => Number(p.latencyMs) || 0);
  const maxLat = Math.max(...latencies, 1);

  const innerW = chrono.length * MARK_W + (chrono.length - 1) * GAP;
  const width = innerW + PAD_X * 2;
  const height = BASE_Y + 6;

  const barHeight = (lat: number) => {
    // taller = slower; clamp so even fast probes stay visible.
    const h = MIN_H + (lat / maxLat) * (MAX_H - MIN_H);
    return Math.max(MIN_H, Math.min(MAX_H, h));
  };

  const xOf = (i: number) => PAD_X + i * (MARK_W + GAP);

  // Tooltip anchor as a percentage so the absolutely-positioned HTML tooltip
  // tracks the SVG regardless of its responsive on-screen width.
  const anchorPct = (i: number) => ((xOf(i) + MARK_W / 2) / width) * 100;

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <h2 style={{ margin: 0 }}>Probe timeline</h2>
        <span className={styles.caption}>
          last {chrono.length} paid probes · oldest → newest · bar height = latency
        </span>
      </div>

      <div className={styles.chartWrap}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Timeline of the last ${chrono.length} probes, coloured by outcome`}
        >
          {/* recessive baseline */}
          <line className={styles.baseline} x1={0} y1={BASE_Y} x2={width} y2={BASE_Y} />

          {chrono.map((p, i) => {
            const o = outcomeOf(p);
            const h = barHeight(Number(p.latencyMs) || 0);
            const x = xOf(i);
            const y = BASE_Y - h;
            return (
              <g
                key={i}
                className={`${styles.mark} ${active === i ? styles.markActive : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
              >
                <rect
                  className={`${styles.bar} ${OUTCOME[o].cls}`}
                  x={x}
                  y={y}
                  width={MARK_W}
                  height={h}
                  rx={2}
                  ry={2}
                />
                {/* enlarged hit target */}
                <rect className={styles.hit} x={x - GAP} y={0} width={MARK_W + GAP * 2} height={height} />
              </g>
            );
          })}
        </svg>

        {active !== null && (() => {
          const p = chrono[active];
          const o = OUTCOME[outcomeOf(p)];
          const ts = Number(p.timestamp);
          return (
            <div
              className={styles.tooltip}
              style={{ left: `${anchorPct(active)}%`, top: `${(BASE_Y - MAX_H - 4) / height * 100}%` }}
            >
              <div className={styles.ttTitle}>
                <span className={`${styles.dot} ${OUTCOME[outcomeOf(p)].cls}`} />
                {o.icon} {o.label}
              </div>
              <div className={styles.ttRow}>{Number(p.latencyMs).toLocaleString()}ms latency</div>
              <div className={styles.ttRow}>
                {ago(ts)} · {new Date(ts * 1000).toLocaleString()}
              </div>
              <div className={styles.ttLinks}>
                {p.paymentRef && (() => {
                  const payment = paymentReceipt(p.paymentRef);
                  return (
                    <a href={payment.url} target="_blank" rel="noreferrer">
                      {payment.label} ↗
                    </a>
                  );
                })()}
                {p.txHash && (
                  <a href={etherscan(p.txHash)} target="_blank" rel="noreferrer">
                    Sepolia attestation ↗
                  </a>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.good}`} />
          <span className={styles.legendIcon} style={{ color: 'var(--status-good)' }}>
            ✓
          </span>
          honest — delivered &amp; matched spec
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.junk}`} />
          <span className={styles.legendIcon} style={{ color: 'var(--status-critical)' }}>
            ✕
          </span>
          junk — paid, response failed spec
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.nodelivery}`} />
          <span className={styles.legendIcon} style={{ color: 'var(--status-serious)' }}>
            ✕
          </span>
          no delivery — nothing returned
        </span>
      </div>
    </div>
  );
}
