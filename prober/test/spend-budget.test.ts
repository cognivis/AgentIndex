import { afterEach, describe, expect, it } from 'vitest';
import {
  BaseSpendBudget,
  createBaseSpendBudget,
  type SpendLedgerStore,
} from '../src/spend-budget.js';

class MemoryStore implements SpendLedgerStore {
  ledger: { utcDate: string; spentAtomic: string } | null = null;
  load() {
    return this.ledger;
  }
  save(ledger: { utcDate: string; spentAtomic: string }) {
    this.ledger = ledger;
  }
}

afterEach(() => {
  delete process.env.BASE_ROUND_BUDGET_ATOMIC;
  delete process.env.BASE_DAILY_BUDGET_ATOMIC;
});

describe('Base aggregate spend budget', () => {
  it('enforces a total cap across several payments in one round', () => {
    const budget = new BaseSpendBudget(5_000n, 10_000n, new MemoryStore());
    budget.record(2_000n);
    budget.record(3_000n);
    expect(budget.canSpend(1n)).toBe(false);
    expect(() => budget.record(1n)).toThrow(/aggregate spend cap/);
  });

  it('persists the daily total across separate one-shot processes', () => {
    const store = new MemoryStore();
    const now = () => new Date('2026-09-12T12:00:00Z');
    new BaseSpendBudget(10_000n, 12_000n, store, now).record(7_000n);
    const nextRun = new BaseSpendBudget(10_000n, 12_000n, store, now);
    expect(nextRun.canSpend(5_000n)).toBe(true);
    nextRun.record(5_000n);
    expect(nextRun.canSpend(1n)).toBe(false);
  });

  it('resets daily spend on the next UTC day while preserving round spend', () => {
    const store = new MemoryStore();
    let instant = new Date('2026-09-12T23:59:00Z');
    const budget = new BaseSpendBudget(10_000n, 10_000n, store, () => instant);
    budget.record(4_000n);
    instant = new Date('2026-09-13T00:01:00Z');
    expect(budget.snapshot()).toMatchObject({ dailySpentAtomic: 0n, roundSpentAtomic: 4_000n });
  });

  it('rejects unsafe configuration above hard ceilings', () => {
    process.env.BASE_ROUND_BUDGET_ATOMIC = '100001';
    expect(() => createBaseSpendBudget(new MemoryStore())).toThrow(/BASE_ROUND_BUDGET_ATOMIC/);
  });

  it('fails closed on a malformed persisted ledger', () => {
    const store = new MemoryStore();
    store.ledger = { utcDate: new Date().toISOString().slice(0, 10), spentAtomic: 'not-a-number' };
    expect(() => new BaseSpendBudget(5_000n, 10_000n, store)).toThrow(/invalid amount/);
  });
});
