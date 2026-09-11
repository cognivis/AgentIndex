import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import { ProbeResult } from '../generated/AttestationRegistry/AttestationRegistry';
import { Probe } from '../generated/schema';
import { getOrCreateService, getStats, recomputeScores } from './shared';

// Curated external services do not pretend to own an AgentIndex ENS subname.
// The attestation contract is intentionally open to any bytes32 service key, so
// hydrate known adapter labels when their first probe arrives. Adding a new
// external provider requires an explicit adapter + labelhash here; directory
// discovery alone can never inject arbitrary named entities into the index.
const TICKERSFEED_NODE = Bytes.fromHexString(
  '0x76be0261701fea43e419bd97f32a629922f835ac95e271181c3652b7e8369c8d',
) as Bytes; // keccak256("ext:tickersfeed")

// These immutable attestations used `/crypto/1`, which requests the unrelated
// token whose literal symbol is "1", while the adapter labelled it BTC. Keep
// the receipts indexed for auditability, but never charge the provider's score
// for an auditor input error.
const INVALID_TICKERSFEED_PROBE_1 = Bytes.fromHexString(
  '0xe45fd10a7ba0e0b61317540cc4794f4f1ec385c8d5f8717639ddab4135388241',
) as Bytes;
const INVALID_TICKERSFEED_PROBE_2 = Bytes.fromHexString(
  '0xc2f92216c86ab2597ff78f98fa263cef1db527d16cbd5b8693c049376477a95d',
) as Bytes;

export function handleProbeResult(event: ProbeResult): void {
  const id = event.transaction.hash.concatI32(event.logIndex.toI32());

  const probe = new Probe(id);
  probe.service = event.params.node;
  probe.prober = event.params.prober;
  probe.delivered = event.params.delivered;
  probe.honest = event.params.honest;
  probe.latencyMs = event.params.latencyMs;
  probe.responseHash = event.params.responseHash;
  probe.amountPaid = event.params.amountPaid;
  probe.paymentRef = event.params.paymentRef;
  probe.timestamp = event.params.timestamp;
  probe.block = event.block.number;
  probe.txHash = event.transaction.hash;
  const invalidAdapterProbe = event.transaction.hash.equals(INVALID_TICKERSFEED_PROBE_1)
    || event.transaction.hash.equals(INVALID_TICKERSFEED_PROBE_2);
  probe.valid = !invalidAdapterProbe;
  probe.invalidReason = invalidAdapterProbe
    ? 'auditor requested /crypto/1 while adapter declared BTC; superseded by /crypto/BTC'
    : null;
  probe.save();

  if (invalidAdapterProbe) return;

  const service = getOrCreateService(event.params.node);
  let newExternalService = false;
  if (service.label == '' && event.params.node.equals(TICKERSFEED_NODE)) {
    service.label = 'ext:tickersfeed';
    service.ensName = '';
    service.registeredAt = event.block.timestamp;
    newExternalService = true;
  }
  service.probeCount = service.probeCount.plus(BigInt.fromI32(1));
  if (event.params.delivered) {
    service.deliveredCount = service.deliveredCount.plus(BigInt.fromI32(1));
  }
  if (event.params.honest) {
    service.honestCount = service.honestCount.plus(BigInt.fromI32(1));
  }
  service.totalLatencyMs = service.totalLatencyMs.plus(event.params.latencyMs);
  service.totalPaid = service.totalPaid.plus(event.params.amountPaid);
  service.lastProbedAt = event.block.timestamp;
  recomputeScores(service);
  service.save();

  const stats = getStats();
  if (newExternalService) {
    stats.serviceCount = stats.serviceCount.plus(BigInt.fromI32(1));
    stats.activeServiceCount = stats.activeServiceCount.plus(BigInt.fromI32(1));
  }
  stats.probeCount = stats.probeCount.plus(BigInt.fromI32(1));
  stats.totalPaid = stats.totalPaid.plus(event.params.amountPaid);
  stats.lastProbeAt = event.block.timestamp;
  stats.save();
}
