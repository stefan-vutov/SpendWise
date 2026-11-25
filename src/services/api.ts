import { Assessment, CATEGORIES, Category, Item, Offer, Settings, UsageSummary, Verdict } from '../domain/types';
import { localAssess } from '../domain/assessment';
import { proActive, useStore } from '../store';
import { getUserId } from './purchases';

export interface AiAssessment extends Assessment {
  reasonablePerson?: { verdict: Verdict; challenge: string };
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(`HTTP ${status}${code ? ` (${code})` : ''}`);
  }
}

async function request<T>(settings: Settings, method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!proActive(settings)) throw new Error('SpendWise Pro not active (free mode)');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-id': await getUserId() },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { code?: string };
      // The server is the source of truth: if it says the subscription lapsed, lock Pro again.
      if (res.status === 402 && !__DEV__) useStore.getState().updateSettings({ proUnlocked: false });
      throw new ApiError(res.status, err.code);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Smart category suggestion. Uses the AI service for Pro subscribers and falls back to the
 * on-device suggestion otherwise (free version, offline, or monthly AI budget used up).
 */
export async function assessItem(
  settings: Settings,
  input: { name: string; price: number; notes?: string; chosenCategory?: Category },
): Promise<AiAssessment> {
  try {
    const r = await request<{
      suggestedCategory: Category;
      confidence: number;
      reasoning: string;
      reasonablePerson?: { verdict: Verdict; challenge: string };
    }>(settings, 'POST', '/assess', { ...input, currency: settings.currency, country: settings.country }, 20_000);
    return { ...r, source: 'ai' };
  } catch {
    return localAssess(input.name, input.price);
  }
}

export interface ScanResult {
  id: string;
  offers: Offer[];
  error?: string;
  /** Not checked because the monthly allowance ran out. */
  skipped?: 'limit';
}

/** Most important items first, so they get checked before the monthly allowance runs out. */
export function scanOrder(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export async function scanPrices(settings: Settings, items: Item[]): Promise<{ results: ScanResult[]; usage: UsageSummary }> {
  return request(
    settings,
    'POST',
    '/prices',
    {
      country: settings.country,
      currency: settings.currency,
      includeInternational: settings.includeInternational,
      items: scanOrder(items).map((i) => ({ id: i.id, name: i.name, targetPrice: i.price, notes: i.notes })),
    },
    // Web searching several items takes a while.
    5 * 60_000,
  );
}

export async function fetchUsage(settings: Settings): Promise<UsageSummary | null> {
  try {
    return await request<UsageSummary>(settings, 'GET', '/usage', undefined, 15_000);
  } catch {
    return null;
  }
}
