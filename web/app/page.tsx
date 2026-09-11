'use client';

import { useCallback, useRef, useState } from 'react';
import styles from './page.module.css';
import { Personas } from '../components/personas';

// Shapes mirror what /api/resolve and /api/receipts return (lib/data.ts).
type Recommendation = 'trusted' | 'caution' | 'avoid' | 'unproven';

interface Service {
  name: string;
  label: string;
  endpoint: string | null;
  method: string | null;
  price: string | null;
  description: string | null;
  trustScore: number;
  deliveryRate: number;
  honestyRate: number;
  avgLatencyMs: number;
  probeCount: number;
  lastProbedAt: number;
  recommendation: Recommendation;
  reasons: string[];
}

interface ResolveMeta {
  subgraphDeployment: string;
  indexedBlock: number;
  indexedAt: string;
  ageSeconds: number;
  fresh: boolean;
}

interface ResolveResponse {
  task: string;
  payThis: Service | null;
  alternatives: Service[];
  avoid: Service[];
  note: string;
  _meta: ResolveMeta;
}

interface Receipt {
  delivered: boolean;
  honest: boolean;
  latencyMs: number;
  paymentRef: string;
  txHash: string;
  timestamp: number;
  paymentNetwork: 'base' | 'hedera' | null;
  paymentUrl: string | null;
  etherscanUrl: string;
}

interface ReceiptsResponse {
  label: string;
  receipts: Receipt[];
  _meta: ResolveMeta;
}

const PRESETS = [
  { task: 'current weather', label: 'current weather' },
  { task: 'token price', label: 'token price' },
  { task: 'geocode an address', label: 'geocode an address' },
  { task: 'summarize this text', label: 'summarize this text' },
  { task: 'translate to French', label: 'translate to French' },
];

// Pull a comparable number out of a price string like "$0.001" or "0.001 USDC".
function priceValue(price: string | null): number | null {
  if (!price) return null;
  const m = price.replace(/,/g, '').match(/-?\d*\.?\d+/);
  return m ? Number(m[0]) : null;
}

export default function Playground() {
  const [task, setTask] = useState('');
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolve = useCallback(async (raw: string) => {
    const t = raw.trim();
    if (!t) {
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: t }),
      });
      const data = (await res.json()) as ResolveResponse & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `request failed (${res.status})`);
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message || 'network error');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onPreset = (t: string) => {
    setTask(t);
    void resolve(t);
  };

  return (
    <div className="wrap">
      <section className={styles.hero}>
        <h1 className={styles.headline}>Ask the index before you pay.</h1>
        <p className={styles.subhead}>
          AI agents pay for services over x402 and get scammed. AgentIndex tells them who&apos;s
          honest — earned by real paid probes, proven on-chain.
        </p>

        <form
          className={styles.ask}
          onSubmit={(e) => {
            e.preventDefault();
            void resolve(task);
          }}
        >
          <label htmlFor="task" className={styles.srOnly}>
            What does your agent need?
          </label>
          <input
            id="task"
            ref={inputRef}
            className={styles.input}
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What does your agent need? e.g. current weather for a city"
            autoComplete="off"
            aria-describedby="ask-hint"
          />
          <button className={styles.resolveBtn} type="submit" disabled={loading}>
            {loading ? 'Resolving…' : 'Resolve'}
          </button>
        </form>

        <div className={styles.presets} role="group" aria-label="Example tasks">
          {PRESETS.map((p) => (
            <button
              key={p.task}
              type="button"
              className={`chip ${styles.preset}`}
              onClick={() => onPreset(p.task)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p id="ask-hint" className={styles.hint}>
          Every verdict is backed by real x402 payments settled on Hedera and attested on Sepolia.
        </p>
      </section>

      <Personas />

      <section aria-live="polite" aria-busy={loading} className={styles.results}>
        {loading && (
          <div className={`tile ${styles.state}`}>
            <span className={styles.spinner} aria-hidden="true" />
            Asking the index and pricing the risk…
          </div>
        )}

        {!loading && error && (
          <div className={`tile ${styles.state} ${styles.errorState}`} role="alert">
            <span aria-hidden="true">✕</span> {error}
          </div>
        )}

        {!loading && !error && result && <ResultView data={result} />}
      </section>
    </div>
  );
}

function ResultView({ data }: { data: ResolveResponse }) {
  const payValue = priceValue(data.payThis?.price ?? null);

  return (
    <div className={styles.resultWrap}>
      <div className={styles.resultHead}>
        <span className={styles.resultTaskLabel}>Resolving</span>
        <span className={styles.resultTask}>&ldquo;{data.task}&rdquo;</span>
      </div>

      {data.payThis ? (
        <PayCard service={data.payThis} note={data.note} />
      ) : (
        <div className={`tile ${styles.refuse}`}>
          <div className={styles.refuseIcon} aria-hidden="true">
            △
          </div>
          <div>
            <div className={styles.refuseTitle}>No trustworthy service — the index won&apos;t spend.</div>
            <p className={styles.refuseBody}>
              The index found no service with a trustworthy track record for this task. It refuses
              to spend. Declining to pay a stranger is the safe answer — and the point.
            </p>
            {data.note && <p className={styles.refuseNote}>{data.note}</p>}
          </div>
        </div>
      )}

      {data.avoid.length > 0 && (
        <div className={styles.avoidGroup}>
          <h2 className={styles.groupTitle}>Avoid</h2>
          <div className={styles.avoidGrid}>
            {data.avoid.map((s) => (
              <AvoidCard key={s.name} service={s} payValue={payValue} />
            ))}
          </div>
        </div>
      )}

      {data.alternatives.length > 0 && (
        <div className={styles.altGroup}>
          <h2 className={styles.groupTitle}>Other options considered</h2>
          <ul className={styles.altList}>
            {data.alternatives.map((s) => (
              <li key={s.name} className={styles.altRow}>
                <span className={styles.altName}>{s.name}</span>
                <span className={`dim ${styles.altScore}`}>trust {s.trustScore}/100</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FreshnessFooter meta={data._meta} />
    </div>
  );
}

function PayCard({ service, note }: { service: Service; note: string }) {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (receipts) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts?label=${encodeURIComponent(service.label)}`);
      const data = (await res.json()) as ReceiptsResponse & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `request failed (${res.status})`);
      } else {
        setReceipts(data.receipts);
      }
    } catch (err) {
      setError((err as Error).message || 'network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.card} ${styles.payCard}`}>
      <div className={styles.payTop}>
        <div className={styles.payBadge} aria-hidden="true">
          ✓
        </div>
        <div className={styles.payHead}>
          <div className={styles.payKicker}>Pay this</div>
          <div className={styles.payName}>{service.name}</div>
          {service.description && <div className={styles.payDesc}>{service.description}</div>}
        </div>
        <div className={styles.payScore}>
          <div className={`num-good ${styles.scoreNum}`}>{service.trustScore}</div>
          <div className="dim">/ 100 trust</div>
        </div>
      </div>

      <div className={styles.metrics}>
        <Metric label="Price" value={service.price ?? '—'} accent="good" />
        <Metric label="Delivery" value={`${service.deliveryRate.toFixed(1)}%`} />
        <Metric label="Honesty" value={`${service.honestyRate.toFixed(1)}%`} />
        <Metric label="Latency" value={`${service.avgLatencyMs.toLocaleString()}ms`} />
        <Metric label="Probes" value={service.probeCount.toLocaleString()} />
      </div>

      {service.reasons.length > 0 && (
        <ul className={styles.reasons}>
          {service.reasons.map((r, i) => (
            <li key={i}>
              <span className="num-good" aria-hidden="true">
                ✓
              </span>{' '}
              {r}
            </li>
          ))}
        </ul>
      )}

      {service.endpoint && (
        <div className={styles.endpointRow}>
          <span className="dim">{service.method ?? 'POST'}</span>
          <code className={styles.endpoint}>{service.endpoint}</code>
        </div>
      )}

      {note && <p className={styles.payNote}>{note}</p>}

      <button
        type="button"
        className={styles.receiptsBtn}
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? 'Hide payment receipts' : 'Show payment receipts'}
      </button>

      {open && (
        <div className={styles.receipts}>
          {loading && <div className="dim">loading receipts…</div>}
          {error && (
            <div className="num-bad" role="alert">
              ✕ {error}
            </div>
          )}
          {!loading && !error && receipts && receipts.length === 0 && (
            <div className="dim">No settled receipts yet for this service.</div>
          )}
          {!loading &&
            !error &&
            receipts?.map((r) => <ReceiptRow key={r.txHash} receipt={r} />)}
        </div>
      )}
    </div>
  );
}

function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const good = receipt.delivered && receipt.honest;
  const outcome = good
    ? { cls: 'num-good', icon: '✓', text: 'delivered & honest' }
    : receipt.delivered
      ? { cls: 'num-bad', icon: '✕', text: 'paid, got junk' }
      : { cls: 'num-bad', icon: '✕', text: 'paid, no delivery' };

  return (
    <div className={styles.receiptRow}>
      <span className={outcome.cls}>
        {outcome.icon} {outcome.text}
      </span>
      <span className={`dim ${styles.receiptLatency}`}>{receipt.latencyMs.toLocaleString()}ms</span>
      <span className={styles.receiptLinks}>
        {receipt.paymentUrl && (
          <a href={receipt.paymentUrl} target="_blank" rel="noopener noreferrer">
            {receipt.paymentNetwork} payment ↗
          </a>
        )}
        <a href={receipt.etherscanUrl} target="_blank" rel="noopener noreferrer">
          attest ↗
        </a>
      </span>
    </div>
  );
}

function AvoidCard({ service, payValue }: { service: Service; payValue: number | null }) {
  const thisValue = priceValue(service.price);
  const cheaper = payValue != null && thisValue != null && thisValue < payValue;

  return (
    <div className={`${styles.card} ${styles.avoidCard}`}>
      <div className={styles.avoidTop}>
        <div className={styles.avoidBadge} aria-hidden="true">
          ✕
        </div>
        <div>
          <div className={styles.avoidKicker}>Avoid</div>
          <div className={styles.avoidName}>{service.name}</div>
        </div>
      </div>

      <div className={styles.avoidPriceRow}>
        <span className={styles.avoidPrice}>{service.price ?? '—'}</span>
        {cheaper && <span className={styles.trap}>△ cheaper than the honest pick — the scam trap</span>}
      </div>

      {service.reasons.length > 0 && (
        <ul className={styles.reasons}>
          {service.reasons.map((r, i) => (
            <li key={i}>
              <span className="num-bad" aria-hidden="true">
                ✕
              </span>{' '}
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'good';
}) {
  return (
    <div className={styles.metric}>
      <div className={`dim ${styles.metricLabel}`}>{label}</div>
      <div className={`${styles.metricValue} ${accent === 'good' ? 'num-good' : ''}`}>{value}</div>
    </div>
  );
}

function FreshnessFooter({ meta }: { meta: ResolveMeta }) {
  const deployment = meta.subgraphDeployment
    ? `${meta.subgraphDeployment.slice(0, 12)}…`
    : 'unknown';
  return (
    <div className={styles.fresh}>
      <span className={`${styles.freshDot} ${meta.fresh ? styles.freshOk : styles.freshStale}`} aria-hidden="true" />
      index synced to block {meta.indexedBlock.toLocaleString()} · {meta.ageSeconds}s old · deployment{' '}
      {deployment} · {meta.fresh ? 'fresh' : 'stale'}
    </div>
  );
}
