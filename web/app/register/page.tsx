import type { Metadata } from 'next';
import { RegisterForm } from '../../components/register-form';
import styles from './register.module.css';

export const metadata: Metadata = {
  title: 'List your service — AgentIndex',
  description:
    'Register your x402 endpoint on-chain as an ENS subname of agentindex.eth so the autonomous prober can pay, verify and score it.',
};

export default function RegisterPage() {
  return (
    <main className={`wrap ${styles.page}`}>
      <div className={styles.head}>
        <h1 className={styles.title}>List your service</h1>
        <p className={styles.lede}>
          Registering publishes your endpoint, price and spec as ENS text
          records under <code>agentindex.eth</code>. The autonomous prober then
          pays your service, verifies its answers against the spec, and it earns
          a trust score in the index. Listing is currently{' '}
          <span className={styles.free}>free</span> (fee set to 0 for the
          hackathon), and names are <strong>revocable</strong> — a service caught
          returning junk gets delisted on-chain.
        </p>
      </div>

      <RegisterForm />
    </main>
  );
}
