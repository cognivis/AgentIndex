import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });
import { discoverFromHost, discoverFromRegistry } from './discovery.js';
import { discoverExternalFeeds } from './external-feeds.js';
import { createPaidFetch } from './payment.js';
import { createAttestor, createDryRunAttestor } from './attest.js';
import { probeOne } from './probe.js';
import { createOracle } from './oracle.js';

const SERVICES_URL = process.env.SERVICES_URL ?? 'http://localhost:4021';
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 10 * 60 * 1000);
const once = process.argv.includes('--once');

const paidFetch = createPaidFetch();
const oracle = createOracle();
const attestor = process.env.ATTESTATION_REGISTRY_ADDRESS
  ? createAttestor()
  : createDryRunAttestor();

async function runRound() {
  console.log(`\n[${new Date().toISOString()}] probe round starting`);
  let targets;
  try {
    // discover from the on-chain registry when configured; host fallback for dev
    targets = process.env.SUBNAME_REGISTRAR_ADDRESS
      ? await discoverFromRegistry()
      : await discoverFromHost(SERVICES_URL);
    console.log(`discovered ${targets.length} services (${process.env.SUBNAME_REGISTRAR_ADDRESS ? 'ens registry' : 'host'})`);
  } catch (err) {
    console.error('discovery failed:', err instanceof Error ? err.message : err);
    return;
  }

  // Pull real third-party price feeds from the public x402 directory so the index
  // rates the actual ecosystem, not just our seeded set. These settle USDC on Base,
  // not HBAR on Hedera, so we only PAY + attest them once the Base payment path is
  // wired (item 1h — needs the Base wallet). Until then we discover + log them
  // rather than write a false "dishonest" verdict from an unpaid 402.
  try {
    const external = await discoverExternalFeeds();
    if (external.length) {
      console.log(`discovered ${external.length} external x402 feed(s): ${external.map((t) => t.label).join(', ')}`);
      if (process.env.PROBE_EXTERNAL === '1') targets = [...targets, ...external];
    }
  } catch (err) {
    console.error('external discovery failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  for (const target of targets) {
    try {
      const { outcome, paymentRef, oracleCheck } = await probeOne(target, paidFetch, oracle);
      const tx = await attestor.attest(target.label, outcome, 0n, paymentRef);
      const oracleNote = oracleCheck
        ? ` oracle=${oracleCheck.verdict}` +
          (oracleCheck.verdict !== 'na'
            ? `(claim=${oracleCheck.claimed} truth=${oracleCheck.truth} Δ${oracleCheck.deviationBps}bps)`
            : '')
        : '';
      console.log(
        `  ${target.label}: delivered=${outcome.delivered} honest=${outcome.honest} ` +
          `${outcome.latencyMs}ms pay=${paymentRef || '-'} attest=${tx.slice(0, 10)}${oracleNote}`,
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
