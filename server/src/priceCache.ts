import type { Offer } from './prices.js';

/**
 * Shared 24-hour cache of price results. If two subscribers watch the same item in the same
 * country, the second check is free (and doesn't count against their monthly checks).
 */
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20_000;
const cache = new Map<string, { offers: Offer[]; at: number }>();

export function cacheKey(name: string, country: string, currency: string, international: boolean) {
  const norm = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return `${country}|${currency}|${international ? 'i' : 'l'}|${norm}`;
}

export function getCached(key: string): Offer[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.offers;
}

export function setCached(key: string, offers: Offer[]) {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { offers, at: Date.now() });
}
