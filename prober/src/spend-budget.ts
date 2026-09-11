import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_BASE_ROUND_BUDGET_ATOMIC = 50_000n; // $0.05 USDC
export const DEFAULT_BASE_DAILY_BUDGET_ATOMIC = 100_000n; // $0.10 USDC
export const HARD_MAX_BASE_ROUND_BUDGET_ATOMIC = 100_000n; // $0.10 USDC
export const HARD_MAX_BASE_DAILY_BUDGET_ATOMIC = 250_000n; // $0.25 USDC

interface SpendLedger {
  utcDate: string;
  spentAtomic: string;
}

export interface SpendLedgerStore {
  load(): SpendLedger | null;
  save(ledger: SpendLedger): void;
}

export class FileSpendLedgerStore implements SpendLedgerStore {
  constructor(
    private readonly path =
      process.env.BASE_SPEND_LEDGER_PATH ||
      resolve(import.meta.dirname, '../../.agentindex/base-spend-ledger.json'),
  ) {}

  load(): SpendLedger | null {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as SpendLedger;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      throw new Error(`cannot read Base spend ledger: ${error instanceof Error ? error.message : error}`);
    }
  }

  save(ledger: SpendLedger): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(ledger)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, this.path);
  }
}

export interface SpendSnapshot {
  utcDate: string;
  roundSpentAtomic: bigint;
  dailySpentAtomic: bigint;
  roundLimitAtomic: bigint;
  dailyLimitAtomic: bigint;
}

export class BaseSpendBudget {
  private roundSpentAtomic = 0n;
  private dailySpentAtomic = 0n;
  private utcDate: string;

  constructor(
    readonly roundLimitAtomic: bigint,
    readonly dailyLimitAtomic: bigint,
    private readonly store: SpendLedgerStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (roundLimitAtomic <= 0n || dailyLimitAtomic <= 0n) {
      throw new Error('Base spend budgets must be positive');
    }
    if (roundLimitAtomic > dailyLimitAtomic) {
      throw new Error('Base round budget cannot exceed the daily budget');
    }
    this.utcDate = this.today();
    this.loadDailySpend();
  }

  canSpend(amountAtomic: bigint): boolean {
    this.rollDayIfNeeded();
    return (
      amountAtomic > 0n &&
      this.roundSpentAtomic + amountAtomic <= this.roundLimitAtomic &&
      this.dailySpentAtomic + amountAtomic <= this.dailyLimitAtomic
    );
  }

  record(amountAtomic: bigint): SpendSnapshot {
    if (!this.canSpend(amountAtomic)) {
      throw new Error(
        `Base aggregate spend cap exceeded (request=${amountAtomic}, round=${this.roundSpentAtomic}/${this.roundLimitAtomic}, daily=${this.dailySpentAtomic}/${this.dailyLimitAtomic})`,
      );
    }
    this.roundSpentAtomic += amountAtomic;
    this.dailySpentAtomic += amountAtomic;
    this.store.save({ utcDate: this.utcDate, spentAtomic: this.dailySpentAtomic.toString() });
    return this.snapshot();
  }

  snapshot(): SpendSnapshot {
    this.rollDayIfNeeded();
    return {
      utcDate: this.utcDate,
      roundSpentAtomic: this.roundSpentAtomic,
      dailySpentAtomic: this.dailySpentAtomic,
      roundLimitAtomic: this.roundLimitAtomic,
      dailyLimitAtomic: this.dailyLimitAtomic,
    };
  }

  private today() {
    return this.now().toISOString().slice(0, 10);
  }

  private rollDayIfNeeded() {
    const today = this.today();
    if (today === this.utcDate) return;
    this.utcDate = today;
    this.dailySpentAtomic = 0n;
  }

  private loadDailySpend() {
    const ledger = this.store.load();
    if (!ledger || ledger.utcDate !== this.utcDate) return;
    if (!/^\d+$/.test(ledger.spentAtomic)) {
      throw new Error('Base spend ledger contains an invalid amount');
    }
    this.dailySpentAtomic = BigInt(ledger.spentAtomic);
    if (this.dailySpentAtomic > this.dailyLimitAtomic) {
      throw new Error('Base daily budget is already exhausted');
    }
  }
}

function envLimit(name: string, fallback: bigint, hardMaximum: bigint): bigint {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer in atomic USDC units`);
  const value = BigInt(raw);
  if (value <= 0n || value > hardMaximum) {
    throw new Error(`${name} must be between 1 and ${hardMaximum}`);
  }
  return value;
}

export function createBaseSpendBudget(store: SpendLedgerStore = new FileSpendLedgerStore()) {
  return new BaseSpendBudget(
    envLimit(
      'BASE_ROUND_BUDGET_ATOMIC',
      DEFAULT_BASE_ROUND_BUDGET_ATOMIC,
      HARD_MAX_BASE_ROUND_BUDGET_ATOMIC,
    ),
    envLimit(
      'BASE_DAILY_BUDGET_ATOMIC',
      DEFAULT_BASE_DAILY_BUDGET_ATOMIC,
      HARD_MAX_BASE_DAILY_BUDGET_ATOMIC,
    ),
    store,
  );
}
