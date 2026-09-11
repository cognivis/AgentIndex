import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });
import { discoverFromHost, discoverFromRegistry } from './discovery.js';
import { discoverExternalFeeds } from './external-feeds.js';
import { assertExternalRunMode, createPaidFetchRouter } from './payment.js';
import { createAttestor, createDryRunAttestor } from './attest.js';
import { probeOne, type ProbeResult } from './probe.js';
import { createOracle } from './oracle.js';
import { applyConsensus } from './consensus.js';

const SERVICES_URL = process.env.SERVICES_URL ?? 'http://localhost:4021';
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 10 * 60 * 1000);
const once = process.argv.includes('--once');
const externalEnabled = process.env.PROBE_EXTERNAL === '1';
assertExternalRunMode(externalEnabled, once);

const paidFetchFor = createPaidFetchRouter();
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
  // not HBAR on Hedera, so they are included only for an explicit one-shot run.
  // The Base client separately enforces network, canonical USDC and amount caps.
  try {
    const external = await discoverExternalFeeds();
    if (external.length) {
      console.log(`discovered ${external.length} external x402 feed(s): ${external.map((t) => t.label).join(', ')}`);
      if (externalEnabled) targets = [...targets, ...external];
    }
  } catch (err) {
    console.error('external discovery failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  const probed: ProbeResult[] = [];
  for (const target of targets) {
    try {
      probed.push(await probeOne(target, paidFetchFor(target), oracle));
    } catch (err) {
      console.error(`  ${target.label}: probe failed —`, err instanceof Error ? err.message : err);
    }
  }

  // Consensus needs the whole round. Only attest after it has had a chance to
  // downgrade an objective-data outlier, so the on-chain verdict is final.
  for (const result of applyConsensus(probed)) {
    const { target, outcome, paymentRef, amountPaid, baseSpend, oracleCheck, consensusCheck } = result;
    try {
      const tx = await attestor.attest(target.label, outcome, amountPaid, paymentRef);
      const oracleNote = oracleCheck
        ? ` oracle=${oracleCheck.verdict}` +
          (oracleCheck.verdict !== 'na'
            ? `(claim=${oracleCheck.claimed} truth=${oracleCheck.truth} Δ${oracleCheck.deviationBps}bps)`
            : '')
        : '';
      const consensusNote = consensusCheck
        ? ` consensus=${consensusCheck.verdict}` +
          (consensusCheck.median != null
            ? `(median=${consensusCheck.median} n=${consensusCheck.providerCount} Δ${consensusCheck.deviationBps}bps)`
            : '')
        : '';
      console.log(
        `  ${target.label}: delivered=${outcome.delivered} honest=${outcome.honest} ` +
          `${outcome.latencyMs}ms pay=${paymentRef || '-'} attest=${tx.slice(0, 10)}` +
          `${oracleNote}${consensusNote}`,
      );
      if (target.source === 'external') {
        let response: unknown = result.body;
        try {
          response = JSON.parse(result.body);
        } catch {
          // Preserve the raw body if a provider returns non-JSON unexpectedly.
        }
        console.log(
          `  external-evidence ${JSON.stringify({
            service: target.label,
            endpoint: target.url,
            response,
            oracle: oracleCheck ?? null,
            consensus: consensusCheck ?? null,
            amountPaid: amountPaid.toString(),
            spendCaps: baseSpend
              ? {
                  roundAtomic: baseSpend.roundAtomic.toString(),
                  dailyAtomic: baseSpend.dailyAtomic.toString(),
                }
              : null,
            paymentRef,
            attestationTx: tx,
          })}`,
        );
      }
    } catch (err) {
      console.error(`  ${target.label}: attestation failed —`, err instanceof Error ? err.message : err);
    }
  }
}

await runRound();
if (!once) {
  console.log(`prober looping every ${INTERVAL_MS / 1000}s`);
  setInterval(runRound, INTERVAL_MS);
}
