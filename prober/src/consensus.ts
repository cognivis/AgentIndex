import type { ProbeResult } from './probe.js';

export type ConsensusVerdict = 'agree' | 'deviates' | 'split' | 'na';

export interface ConsensusCheck {
  symbol: string;
  claimed: number | null;
  median: number | null;
  deviationBps: number | null;
  toleranceBps: number;
  providerCount: number;
  verdict: ConsensusVerdict;
  reason?: string;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current)) return current[Number(key)];
    if (typeof current === 'object') return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

export function extractClaimedPrice(result: Pick<ProbeResult, 'target' | 'body'>): number | null {
  if (!result.target.pricePath) return null;
  try {
    const raw = getPath(JSON.parse(result.body), result.target.pricePath);
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw.replace(/[$,\s]/g, ''));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  } catch {
    // Invalid JSON is already handled by spec verification.
  }
  return null;
}

function toleranceFromEnv(): number {
  const value = Number(
    process.env.CONSENSUS_TOLERANCE_BPS ?? process.env.ORACLE_TOLERANCE_BPS ?? 200,
  );
  return Number.isFinite(value) && value >= 0 ? value : 200;
}

export type ConsensusProbeResult = ProbeResult & { consensusCheck?: ConsensusCheck };

/// Apply same-symbol consensus after all requests in a round finish. Two peers
/// can confirm agreement, but cannot identify which party is wrong when they
/// diverge, so a two-provider split is reported neutrally. Three or more peers
/// can identify and downgrade median outliers.
export function applyConsensus(
  results: ProbeResult[],
  toleranceBps = toleranceFromEnv(),
): ConsensusProbeResult[] {
  const groups = new Map<string, { index: number; claimed: number }[]>();

  results.forEach((result, index) => {
    if (
      result.target.category !== 'price' ||
      !result.outcome.delivered ||
      !result.specHonest ||
      !result.target.symbol
    ) return;
    const claimed = extractClaimedPrice(result);
    if (claimed == null) return;
    const symbol = result.target.symbol.toUpperCase();
    const group = groups.get(symbol) ?? [];
    group.push({ index, claimed });
    groups.set(symbol, group);
  });

  const output: ConsensusProbeResult[] = results.map((result) => ({ ...result }));
  for (const [symbol, group] of groups) {
    const midpoint = median(group.map((entry) => entry.claimed));
    if (midpoint == null) continue;
    const splitPair = group.length === 2 &&
      group.some((entry) => Math.round((Math.abs(entry.claimed - midpoint) / midpoint) * 10_000) > toleranceBps);

    for (const entry of group) {
      const deviationBps = Math.round((Math.abs(entry.claimed - midpoint) / midpoint) * 10_000);
      const insufficient = group.length < 2;
      const verdict: ConsensusVerdict = insufficient
        ? 'na'
        : splitPair
          ? 'split'
          : deviationBps > toleranceBps
            ? 'deviates'
            : 'agree';
      const reason = insufficient
        ? 'fewer than two comparable providers'
        : splitPair
          ? 'two providers disagree; no majority to identify the outlier'
          : undefined;

      output[entry.index].consensusCheck = {
        symbol,
        claimed: entry.claimed,
        median: midpoint,
        deviationBps,
        toleranceBps,
        providerCount: group.length,
        verdict,
        ...(reason ? { reason } : {}),
      };
      if (verdict === 'deviates') {
        output[entry.index].outcome = { ...output[entry.index].outcome, honest: false };
      }
    }
  }

  // Price results that were not comparable still receive an explicit `na`
  // result so logs and downstream code never confuse “not checked” with “passed”.
  output.forEach((result) => {
    if (result.target.category === 'price' && !result.consensusCheck) {
      result.consensusCheck = {
        symbol: (result.target.symbol ?? '').toUpperCase(),
        claimed: extractClaimedPrice(result),
        median: null,
        deviationBps: null,
        toleranceBps,
        providerCount: 0,
        verdict: 'na',
        reason: 'response was not delivered, spec-conformant, or price-comparable',
      };
    }
  });

  return output;
}
