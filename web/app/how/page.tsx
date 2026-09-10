import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import styles from './how.module.css';

type Stage = {
  n: number;
  title: string;
  desc: ReactNode;
  sponsor: string;
  link: { href: string; label: string; internal?: boolean };
  deploy?: string;
};

const stages: Stage[] = [
  {
    n: 1,
    title: 'Register',
    desc: (
      <>
        A service claims an ENS name like <code>weatherpro.agentindex.eth</code> and publishes its
        endpoint, price, and spec as ENS text records.
      </>
    ),
    sponsor: 'ENS (ENSv2)',
    link: {
      href: 'https://sepolia.etherscan.io/address/0xdeB458892c7702Fe0112161EEa28C0F46eFd6379',
      label: 'ServiceRegistrar on-chain ↗',
    },
  },
  {
    n: 2,
    title: 'Probe',
    desc: (
      <>
        An autonomous prober pays each service real HBAR over x402 on Hedera testnet — anonymously,
        like any customer — and records what came back.
      </>
    ),
    sponsor: 'Hedera',
    link: { href: 'https://hashscan.io/testnet', label: 'HashScan ↗' },
  },
  {
    n: 3,
    title: 'Attest',
    desc: (
      <>
        Every probe&apos;s result — delivered? honest vs its claimed spec? how slow? — is written
        on-chain as an attestation.
      </>
    ),
    sponsor: 'on-chain (Sepolia)',
    link: {
      href: 'https://sepolia.etherscan.io/address/0x33406801acD2A16549462153261A224F779768CC',
      label: 'AttestationRegistry on-chain ↗',
    },
  },
  {
    n: 4,
    title: 'Index',
    desc: <>The Graph indexes every attestation and computes each service&apos;s trust score.</>,
    sponsor: 'The Graph',
    link: {
      href: 'https://api.studio.thegraph.com/query/1759003/agentindex-sepolia/v0.0.1',
      label: 'subgraph endpoint ↗',
    },
    deploy: 'QmStXteiGmMiigj5NCUjCvt6PLhUaHqnYH7fpH9gPQJKyF',
  },
  {
    n: 5,
    title: 'Query',
    desc: (
      <>
        An AI agent asks the index (over MCP: <code>find_service</code> / <code>check_trust</code> /{' '}
        <code>resolve_data_need</code>) which service to pay — and which to avoid — before spending a
        cent.
      </>
    ),
    sponsor: 'MCP',
    link: { href: '/connect', label: 'connect an agent →', internal: true },
  },
];

export default function HowItWorks() {
  return (
    <div className="wrap">
      <div className={styles.head}>
        <h1>How AgentIndex works</h1>
        <p className={styles.intro}>
          AgentIndex turns &ldquo;which service can I trust?&rdquo; into an answer backed by
          receipts.
        </p>
      </div>

      <div className={styles.flow}>
        {stages.map((s, i) => (
          <Fragment key={s.n}>
            <div className={styles.stage}>
              <div className={styles.badge}>{s.n}</div>
              <div className={styles.body}>
                <div className={styles.stageHead}>
                  <span className={styles.title}>{s.title}</span>
                  <span className={styles.pill}>{s.sponsor}</span>
                </div>
                <p className={styles.desc}>{s.desc}</p>
                <div className={styles.meta}>
                  {s.link.internal ? (
                    <Link className={styles.link} href={s.link.href}>
                      {s.link.label}
                    </Link>
                  ) : (
                    <a
                      className={styles.link}
                      href={s.link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.link.label}
                    </a>
                  )}
                </div>
                {s.deploy && (
                  <div className={styles.deploy}>
                    pinned deployment <span>{s.deploy}</span>
                  </div>
                )}
              </div>
            </div>
            {i < stages.length - 1 && <div className={styles.connector} />}
          </Fragment>
        ))}
      </div>

      <div className={styles.formula}>
        <div className={styles.formulaLabel}>Trust score formula</div>
        <div className={styles.formulaExpr}>
          trust = <b>60%</b> delivery + <b>25%</b> honesty + <b>15%</b> latency
        </div>
        <div className={styles.bar}>
          <div className={`${styles.seg} ${styles.segDelivery}`}>
            60%<small>delivery</small>
          </div>
          <div className={`${styles.seg} ${styles.segHonesty}`}>
            25%<small>honesty</small>
          </div>
          <div className={`${styles.seg} ${styles.segLatency}`}>
            15%<small>latency</small>
          </div>
        </div>
      </div>

      <p className={styles.callout}>
        <b>ENS</b> gives every service an identity, <b>Hedera</b> settles every probe payment, and{' '}
        <b>The Graph</b> turns the on-chain receipts into a trust score agents can query.
      </p>
    </div>
  );
}
