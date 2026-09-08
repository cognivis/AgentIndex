import { BigInt } from '@graphprotocol/graph-ts';
import {
  ServiceDelisted,
  ServiceRegistered,
  ServiceRenewed,
} from '../generated/ServiceRegistrar/ServiceRegistrar';
import { getOrCreateService, getStats } from './shared';

export function handleServiceRegistered(event: ServiceRegistered): void {
  const service = getOrCreateService(event.params.labelhash);
  const isNew = service.registeredAt.isZero();

  service.label = event.params.label;
  service.ensName = event.params.label.concat('.agentindex.eth');
  service.owner = event.params.owner;
  service.expiry = event.params.expiry;
  service.registeredAt = event.block.timestamp;
  service.registrationPrice = event.params.price;
  service.delisted = false;
  service.delistReason = null;
  service.save();

  const stats = getStats();
  if (isNew) {
    stats.serviceCount = stats.serviceCount.plus(BigInt.fromI32(1));
  }
  stats.activeServiceCount = stats.activeServiceCount.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleServiceRenewed(event: ServiceRenewed): void {
  const service = getOrCreateService(event.params.labelhash);
  service.expiry = event.params.newExpiry;
  service.save();
}

export function handleServiceDelisted(event: ServiceDelisted): void {
  const service = getOrCreateService(event.params.labelhash);
  const wasActive = !service.delisted;
  service.delisted = true;
  service.delistReason = event.params.reason;
  service.save();

  if (wasActive) {
    const stats = getStats();
    stats.activeServiceCount = stats.activeServiceCount.minus(BigInt.fromI32(1));
    stats.save();
  }
}
