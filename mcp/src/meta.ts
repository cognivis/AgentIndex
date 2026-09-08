// Every tool response carries this block: which subgraph deployment answered,
// what block it had synced to, and how stale that is. Agents should treat
// stale data as a reason to re-check, not a hard guarantee.
import type { Meta } from './subgraph.js';

export function freshness(meta: Meta) {
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - meta.block.timestamp);
  return {
    subgraphDeployment: process.env.SUBGRAPH_DEPLOYMENT_ID ?? meta.deployment,
    indexedBlock: meta.block.number,
    indexedAt: new Date(meta.block.timestamp * 1000).toISOString(),
    ageSeconds,
    fresh: ageSeconds < 300,
  };
}
