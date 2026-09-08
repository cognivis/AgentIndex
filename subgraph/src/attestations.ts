import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import { ProbeResult } from '../generated/AttestationRegistry/AttestationRegistry';
import { Probe } from '../generated/schema';
import { getOrCreateService, getStats, recomputeScores } from './shared';

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
  probe.save();

  const service = getOrCreateService(event.params.node);
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
  stats.probeCount = stats.probeCount.plus(BigInt.fromI32(1));
  stats.totalPaid = stats.totalPaid.plus(event.params.amountPaid);
  stats.lastProbeAt = event.block.timestamp;
  stats.save();
}
