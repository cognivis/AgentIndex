import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });
import { discoverFromHost } from './discovery.js';
import { createPaidFetch } from './payment.js';
import { createAttestor, createDryRunAttestor } from './attest.js';
import { probeOne } from './probe.js';

const SERVICES_URL = process.env.SERVICES_URL ?? 'http://localhost:4021';
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 10 * 60 * 1000);
const once = process.argv.includes('--once');

const paidFetch = createPaidFetch();
const attestor = process.env.ATTESTATION_REGISTRY_ADDRESS
  ? createAttestor()
  : createDryRunAttestor();

async function runRound() {
  console.log(`\n[${new Date().toISOString()}] probe round starting`);
  let targets;
  try {
    targets = await discoverFromHost(SERVICES_URL);
  } catch (err) {
    console.error('discovery failed:', err instanceof Error ? err.message : err);
    return;
  }

  for (const target of targets) {
    try {
      const { outcome, paymentRef } = await probeOne(target, paidFetch);
      const tx = await attestor.attest(target.label, outcome, 0n, paymentRef);
      console.log(
        `  ${target.label}: delivered=${outcome.delivered} honest=${outcome.honest} ` +
          `${outcome.latencyMs}ms pay=${paymentRef || '-'} attest=${tx.slice(0, 10)}`,
      );
    } catch (err) {
      console.error(`  ${target.label}: probe failed —`, err instanceof Error ? err.message : err);
    }
  }
}

await runRound();
if (!once) {
  console.log(`prober looping every ${INTERVAL_MS / 1000}s`);
  setInterval(runRound, INTERVAL_MS);
}
