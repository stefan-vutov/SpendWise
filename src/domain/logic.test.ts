import { describe, it, expect } from '@jest/globals';
import { computeTotals, isStale, nextCategoryDown, isScanDue, bestDeal, moveToCategory, estimatedMonthlyChecks } from './logic';
import { evaluateCheck, localAssess, categoryForVerdict } from './assessment';
import { Item } from './types';

const base = (over: Partial<Item> = {}): Item => ({
  id: '1',
  name: 'Thing',
  price: 100,
  category: 'need',
  createdAt: '2026-01-01T00:00:00.000Z',
  categoryEnteredAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('totals', () => {
  it('sums per category and overall, excluding purchased items', () => {
    const t = computeTotals([
      base({ id: 'a', price: 10.1, category: 'need' }),
      base({ id: 'b', price: 20.2, category: 'need' }),
      base({ id: 'c', price: 5, category: 'nice' }),
      base({ id: 'd', price: 999, category: 'nice', purchasedAt: '2026-01-02T00:00:00.000Z' }),
    ]);
    expect(t.byCategory.need).toEqual({ total: 30.3, count: 2 });
    expect(t.byCategory.nice).toEqual({ total: 5, count: 1 });
    expect(t.byCategory.must.total).toBe(0);
    expect(t.overall).toEqual({ total: 35.3, count: 3 });
  });
});

describe('downgrade', () => {
  it('steps down one category at a time', () => {
    expect(nextCategoryDown('need')).toBe('must');
    expect(nextCategoryDown('must')).toBe('good');
    expect(nextCategoryDown('nice')).toBeNull();
  });

  it('flags need/must items older than threshold', () => {
    const now = new Date('2026-02-05T00:00:00.000Z'); // 35 days later
    expect(isStale(base(), '1m', now)).toBe(true);
    expect(isStale(base(), '2m', now)).toBe(false);
    expect(isStale(base({ category: 'good' }), '1w', now)).toBe(false);
    expect(isStale(base({ purchasedAt: now.toISOString() }), '1w', now)).toBe(false);
  });

  it('re-confirming resets the clock', () => {
    const now = new Date('2026-02-05T00:00:00.000Z');
    expect(isStale(base({ lastReviewedAt: '2026-02-01T00:00:00.000Z' }), '1w', now)).toBe(false);
  });

  it('moving category resets categoryEnteredAt', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const moved = moveToCategory(base(), 'must', now);
    expect(moved.categoryEnteredAt).toBe(now.toISOString());
    expect(isStale(moved, '1w', now)).toBe(false);
  });
});

describe('scan schedule', () => {
  const now = new Date('2026-01-10T00:00:00.000Z');
  it('respects frequency', () => {
    expect(isScanDue('off', undefined, now)).toBe(false);
    expect(isScanDue('daily', undefined, now)).toBe(true);
    expect(isScanDue('daily', '2026-01-09T00:30:00.000Z', now)).toBe(true); // within slack
    expect(isScanDue('weekly', '2026-01-08T00:00:00.000Z', now)).toBe(false);
    expect(isScanDue('weekly', '2026-01-02T00:00:00.000Z', now)).toBe(true);
  });
});

describe('allowance estimate', () => {
  it('estimates monthly checks by frequency', () => {
    expect(estimatedMonthlyChecks(20, 'weekly')).toBe(87);
    expect(estimatedMonthlyChecks(4, 'daily')).toBe(120);
    expect(estimatedMonthlyChecks(50, 'off')).toBe(0);
  });
});

describe('deals', () => {
  it('picks the cheapest offer below target price', () => {
    const deal = bestDeal(base({ price: 100 }), [
      { store: 'A', price: 120, currency: 'USD', onSale: false },
      { store: 'B', price: 90, currency: 'USD', onSale: true },
      { store: 'C', price: 85, currency: 'USD', onSale: false },
    ]);
    expect(deal?.store).toBe('C');
    expect(bestDeal(base({ price: 50 }), [{ store: 'A', price: 60, currency: 'USD', onSale: true }])).toBeNull();
  });
});

describe('assessment', () => {
  it('classifies obvious items locally', () => {
    expect(localAssess('Prescription glasses', 300).suggestedCategory).toBe('need');
    expect(localAssess('PlayStation 6', 600).suggestedCategory).toBe('nice');
    expect(localAssess('Mystery object', 900).suggestedCategory).toBe('nice');
  });

  it('scores the reasonable-person check', () => {
    expect(evaluateCheck({ harm: true, replaces: true, alternative: false, cheaper: false, impulse: false })).toBe('justified');
    expect(evaluateCheck({ harm: false, replaces: false, alternative: true, cheaper: true, impulse: true })).toBe('not_justified');
    expect(evaluateCheck({ harm: false, replaces: true, alternative: false, cheaper: true, impulse: false })).toBe('borderline');
  });

  it('maps verdicts to recommended categories', () => {
    expect(categoryForVerdict('need', 'justified')).toBe('need');
    expect(categoryForVerdict('need', 'borderline')).toBe('must');
    expect(categoryForVerdict('must', 'not_justified')).toBe('good');
  });
});
