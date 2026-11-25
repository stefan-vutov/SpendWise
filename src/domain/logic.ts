import {
  CATEGORIES,
  Category,
  Item,
  Offer,
  PROTECTED_CATEGORIES,
  ScanFrequency,
  StaleThreshold,
} from './types';

const DAY = 24 * 60 * 60 * 1000;

// ---------- Totals ----------

export interface Totals {
  byCategory: Record<Category, { total: number; count: number }>;
  overall: { total: number; count: number };
}

/** Totals of items still on the list (purchased items are excluded). */
export function computeTotals(items: Item[]): Totals {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, { total: 0, count: 0 }]),
  ) as Totals['byCategory'];
  const overall = { total: 0, count: 0 };
  for (const item of items) {
    if (item.purchasedAt) continue;
    byCategory[item.category].total = round2(byCategory[item.category].total + item.price);
    byCategory[item.category].count += 1;
    overall.total = round2(overall.total + item.price);
    overall.count += 1;
  }
  return { byCategory, overall };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- Category movement ----------

export function nextCategoryDown(category: Category): Category | null {
  const i = CATEGORIES.indexOf(category);
  return i < CATEGORIES.length - 1 ? CATEGORIES[i + 1] : null;
}

export function isProtected(category: Category): boolean {
  return PROTECTED_CATEGORIES.includes(category);
}

/** Moving an item into a more essential category than it was. */
export function isUpgrade(from: Category | undefined, to: Category): boolean {
  if (!from) return true;
  return CATEGORIES.indexOf(to) < CATEGORIES.indexOf(from);
}

export function moveToCategory(item: Item, category: Category, now = new Date()): Item {
  if (item.category === category) return item;
  return { ...item, category, categoryEnteredAt: now.toISOString(), lastReviewedAt: undefined };
}

// ---------- Staleness / downgrade prompts ----------

export function thresholdToMs(t: StaleThreshold): number {
  const n = parseInt(t, 10);
  return t.endsWith('w') ? n * 7 * DAY : n * 30 * DAY;
}

/**
 * An item in "Need to have" / "Must have" is stale when it has sat there longer than
 * the threshold without being bought or re-confirmed. If someone really needed it,
 * they'd usually have bought it by now — so we ask whether to downgrade.
 */
export function isStale(item: Item, threshold: StaleThreshold, now = new Date()): boolean {
  if (item.purchasedAt || !isProtected(item.category)) return false;
  const since = Math.max(
    Date.parse(item.categoryEnteredAt),
    item.lastReviewedAt ? Date.parse(item.lastReviewedAt) : 0,
  );
  return now.getTime() - since >= thresholdToMs(threshold);
}

export function staleItems(items: Item[], threshold: StaleThreshold, now = new Date()): Item[] {
  return items.filter((i) => isStale(i, threshold, now));
}

export function daysOnList(item: Item, now = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(item.categoryEnteredAt)) / DAY);
}

// ---------- Price scanning ----------

export function scanIntervalMs(f: ScanFrequency): number | null {
  if (f === 'daily') return DAY;
  if (f === 'weekly') return 7 * DAY;
  return null;
}

export function isScanDue(f: ScanFrequency, lastScanAt: string | undefined, now = new Date()): boolean {
  const interval = scanIntervalMs(f);
  if (interval === null) return false;
  if (!lastScanAt) return true;
  // Allow 1h of slack: OS background schedulers rarely fire exactly on time.
  return now.getTime() - Date.parse(lastScanAt) >= interval - 60 * 60 * 1000;
}

/**
 * Returns the cheapest offer that beats the person's target price, or null.
 * Any offer below what they were willing to pay counts as a deal worth flagging.
 */
export function bestDeal(item: Item, offers: Offer[]): Offer | null {
  const cheaper = offers
    .filter((o) => Number.isFinite(o.price) && o.price > 0 && o.price < item.price)
    .sort((a, b) => a.price - b.price);
  return cheaper[0] ?? null;
}

/** Rough price checks a month for a list of this size at this frequency (one item = one check). */
export function estimatedMonthlyChecks(itemCount: number, f: ScanFrequency): number {
  if (f === 'daily') return itemCount * 30;
  if (f === 'weekly') return Math.ceil(itemCount * 4.35);
  return 0;
}
