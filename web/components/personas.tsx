import Link from 'next/link';
import styles from './personas.module.css';

// The three users of AgentIndex, made obvious at a glance. Each jumps to that
// user's flow; the AI agent is the surface you're already on.
export function Personas() {
  return (
    <section className={styles.strip} aria-label="Who AgentIndex is for">
      <h2 className={styles.title}>Three users, one index</h2>
      <div className={styles.grid}>
        <div className={`${styles.card} ${styles.here}`}>
          <div className={styles.icon} aria-hidden="true">
            🤖
          </div>
          <div className={styles.role}>
            AI <span>agent</span>
          </div>
          <p className={styles.desc}>
            Needs data, has a budget. Asks the index who to pay and who to avoid before spending a
            cent over x402.
          </p>
          <span className={styles.hereTag}>You&apos;re trying it right here ↑</span>
        </div>

        <Link href="/register" className={styles.card}>
          <div className={styles.icon} aria-hidden="true">
            🏪
          </div>
          <div className={styles.role}>
            Service <span>provider</span>
          </div>
          <p className={styles.desc}>
            Registers an ENS name, publishes its endpoint and spec, then earns a trust score from
            real paid probes.
          </p>
          <span className={styles.cta}>List your service →</span>
        </Link>

        <Link href="/connect" className={styles.card}>
          <div className={styles.icon} aria-hidden="true">
            🧑‍💻
          </div>
          <div className={styles.role}>
            <span>Developer</span>
          </div>
          <p className={styles.desc}>
            Plugs the index into their own agent over MCP, so it checks trust before every payment.
          </p>
          <span className={styles.cta}>Connect your agent →</span>
        </Link>
      </div>
    </section>
  );
}
