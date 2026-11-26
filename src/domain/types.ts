/** Categories ordered from most to least essential. */
export const CATEGORIES = ['need', 'must', 'good', 'nice'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  need: 'Need to have',
  must: 'Must have',
  good: 'Good to have',
  nice: 'Nice to have',
};

export const CATEGORY_HINTS: Record<Category, string> = {
  need: 'Essential right now — health, safety, shelter, food, or keeping your income.',
  must: 'Required soon — something important is blocked or failing without it.',
  good: 'Clear practical benefit, but life goes on fine without it for now.',
  nice: 'A want, treat or upgrade. Pure discretionary spending.',
};

/** The two top categories get the "reasonable person" check and the staleness review. */
export const PROTECTED_CATEGORIES: readonly Category[] = ['need', 'must'];

export type ScanFrequency = 'daily' | 'weekly' | 'off';

export const STALE_THRESHOLDS = ['1w', '2w', '1m', '2m', '3m', '4m', '5m', '6m'] as const;
export type StaleThreshold = (typeof STALE_THRESHOLDS)[number];

export const STALE_THRESHOLD_LABELS: Record<StaleThreshold, string> = {
  '1w': '1 week',
  '2w': '2 weeks',
  '1m': '1 month',
  '2m': '2 months',
  '3m': '3 months',
  '4m': '4 months',
  '5m': '5 months',
  '6m': '6 months',
};

export interface Offer {
  store: string;
  price: number;
  currency: string;
  url?: string;
  /** True when the retailer marks it as discounted/on sale. */
  onSale: boolean;
}

export interface SaleAlert {
  bestOffer: Offer;
  foundAt: string; // ISO date
  /** How much cheaper than the item's target price. */
  savings: number;
  dismissed?: boolean;
}

export interface Assessment {
  suggestedCategory: Category;
  reasoning: string;
  /** 0..1 */
  confidence: number;
  source: 'ai' | 'local';
}

export interface ReasonablePersonCheck {
  answers: Record<string, boolean>;
  verdict: Verdict;
  note?: string;
  checkedAt: string;
}

export type Verdict = 'justified' | 'borderline' | 'not_justified';

export interface Item {
  id: string;
  name: string;
  notes?: string;
  /** Amount the person is willing to pay, or the price they found in store. */
  price: number;
  category: Category;
  createdAt: string;
  /** When the item entered its current category (resets on up/downgrade). */
  categoryEnteredAt: string;
  /** When the person last confirmed "keep it here" on a downgrade prompt. */
  lastReviewedAt?: string;
  assessment?: Assessment;
  check?: ReasonablePersonCheck;
  sale?: SaleAlert;
  purchasedAt?: string;
}

export interface UsageSummary {
  month: string;
  priceChecksUsed: number;
  priceChecksLimit: number;
  priceChecksLeft: number;
  resetsAt: string;
}

export interface Settings {
  country: string; // ISO 3166-1 alpha-2, e.g. "US", "AU", "BG"
  currency: string; // ISO 4217, e.g. "USD"
  scanFrequency: ScanFrequency;
  includeInternational: boolean;
  staleThreshold: StaleThreshold;
  /** Base URL of the Spendbrake server (AI assessment + price scanning). */
  apiBaseUrl: string;
  lastScanAt?: string;
  lastStaleNotifyAt?: string;
  /** Set by the in-app purchase flow once Spendbrake Pro is sold (not yet). */
  proUnlocked?: boolean;
  /** Store page where the person can cancel or change their subscription. */
  manageSubscriptionUrl?: string;
  /** Random id for this install, used when subscriptions aren't configured (development). */
  installId?: string;
  /** Latest Pro allowance figures from the server. */
  usage?: UsageSummary;
  /** Month ("2026-11") we last told the person their allowance ran out. */
  limitNotifiedMonth?: string;
}
