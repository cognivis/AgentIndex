import type { Verdict } from '../../mcp/src/rank';

const CHIP: Record<Verdict['recommendation'], { icon: string; text: string }> = {
  trusted: { icon: '✓', text: 'trusted' },
  caution: { icon: '△', text: 'caution' },
  avoid: { icon: '✕', text: 'avoid' },
  unproven: { icon: '·', text: 'unproven' },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const c = CHIP[verdict.recommendation];
  return (
    <span className={`chip ${verdict.recommendation}`} title={verdict.reasons.join('; ')}>
      {c.icon} {c.text}
    </span>
  );
}

export function ScoreMeter({ scoreBps }: { scoreBps: string }) {
  const pct = Number(scoreBps) / 100;
  return (
    <div className="meter">
      <div className="track">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="num">{pct.toFixed(1)}</div>
    </div>
  );
}

export function Freshness({ block, timestamp }: { block: number; timestamp: number }) {
  const age = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  return (
    <div className="freshness">
      <span className="dot" />
      indexed block {block.toLocaleString()} · {age}s behind
    </div>
  );
}

export const hashscan = (ref: string) => `https://hashscan.io/testnet/transaction/${ref}`;
export const etherscan = (tx: string) => `https://sepolia.etherscan.io/tx/${tx}`;
