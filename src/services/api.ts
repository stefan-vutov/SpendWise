import { Assessment, Category, Item, Offer, Settings, Verdict } from '../domain/types';
import { localAssess } from '../domain/assessment';

export interface AiAssessment extends Assessment {
  reasonablePerson?: { verdict: Verdict; challenge: string };
}

async function post<T>(settings: Settings, path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Smart category suggestion. Uses the AI service when reachable and falls back to the
 * on-device heuristic otherwise, so adding items never blocks on the network.
 */
export async function assessItem(
  settings: Settings,
  input: { name: string; price: number; notes?: string; chosenCategory?: Category },
): Promise<AiAssessment> {
  try {
    const r = await post<{
      suggestedCategory: Category;
      confidence: number;
      reasoning: string;
      reasonablePerson?: { verdict: Verdict; challenge: string };
    }>(
      settings,
      '/assess',
      { ...input, currency: settings.currency, country: settings.country },
      20_000,
    );
    return { ...r, source: 'ai' };
  } catch {
    return localAssess(input.name, input.price);
  }
}

export async function scanPrices(
  settings: Settings,
  items: Item[],
): Promise<{ id: string; offers: Offer[] }[]> {
  const r = await post<{ results: { id: string; offers: Offer[] }[] }>(
    settings,
    '/prices',
    {
      country: settings.country,
      currency: settings.currency,
      includeInternational: settings.includeInternational,
      items: items.map((i) => ({ id: i.id, name: i.name, targetPrice: i.price, notes: i.notes })),
    },
    // Web searching several items takes a while.
    5 * 60_000,
  );
  return r.results;
}
