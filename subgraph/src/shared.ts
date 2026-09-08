import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import { IndexStats, Service } from '../generated/schema';

export const ZERO = BigInt.zero();
export const BPS = BigInt.fromI32(10_000);

export function getStats(): IndexStats {
  let stats = IndexStats.load('global');
  if (stats == null) {
    stats = new IndexStats('global');
    stats.serviceCount = ZERO;
    stats.activeServiceCount = ZERO;
    stats.probeCount = ZERO;
    stats.totalPaid = ZERO;
    stats.lastProbeAt = ZERO;
  }
  return stats;
}

// Probes can land for a labelhash before we've seen its registration
// (or for services registered outside our registrar) — create a stub
// so no attestation is ever dropped.
export function getOrCreateService(labelhash: Bytes): Service {
  let service = Service.load(labelhash);
  if (service == null) {
    service = new Service(labelhash);
    service.label = '';
    service.ensName = '';
    service.owner = Bytes.empty();
    service.expiry = ZERO;
    service.registeredAt = ZERO;
    service.registrationPrice = ZERO;
    service.delisted = false;
    service.probeCount = ZERO;
    service.deliveredCount = ZERO;
    service.honestCount = ZERO;
    service.totalLatencyMs = ZERO;
    service.totalPaid = ZERO;
    service.deliveryRateBps = ZERO;
    service.honestyRateBps = ZERO;
    service.avgLatencyMs = ZERO;
    service.trustScoreBps = ZERO;
    service.lastProbedAt = ZERO;
  }
  return service;
}

// trust = 0.6*delivery + 0.25*honesty + 0.15*latency, all in bps.
// latency component: 10000 at 0ms, linearly down to 0 at >=10s.
export function recomputeScores(service: Service): void {
  if (service.probeCount.equals(ZERO)) return;

  service.deliveryRateBps = service.deliveredCount.times(BPS).div(service.probeCount);
  service.honestyRateBps = service.honestCount.times(BPS).div(service.probeCount);
  service.avgLatencyMs = service.totalLatencyMs.div(service.probeCount);

  let latencyBps = ZERO;
  const tenSeconds = BigInt.fromI32(10_000);
  if (service.avgLatencyMs.lt(tenSeconds)) {
    latencyBps = tenSeconds.minus(service.avgLatencyMs).times(BPS).div(tenSeconds);
  }

  service.trustScoreBps = service.deliveryRateBps
    .times(BigInt.fromI32(60))
    .plus(service.honestyRateBps.times(BigInt.fromI32(25)))
    .plus(latencyBps.times(BigInt.fromI32(15)))
    .div(BigInt.fromI32(100));
}
