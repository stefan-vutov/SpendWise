import { PRO_PLAN } from './plans.js';

/**
 * Checks with RevenueCat whether a user currently has SpendWise Pro.
 * Needs REVENUECAT_SECRET_KEY (a *secret* API key from the RevenueCat dashboard, never the
 * public key used in the app). For local testing without RevenueCat, set DEV_ALLOW_ALL=1.
 */
const SECRET = process.env.REVENUECAT_SECRET_KEY;
const DEV_ALLOW_ALL = process.env.DEV_ALLOW_ALL === '1';

const cache = new Map<string, { pro: boolean; until: number }>();

export async function hasPro(userId: string): Promise<boolean> {
  if (!SECRET) return DEV_ALLOW_ALL;

  const hit = cache.get(userId);
  if (hit && hit.until > Date.now()) return hit.pro;

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  if (!res.ok) throw new Error(`RevenueCat lookup failed: ${res.status}`);
  const body = (await res.json()) as {
    subscriber?: { entitlements?: Record<string, { expires_date: string | null }> };
  };
  const ent = body.subscriber?.entitlements?.[PRO_PLAN.entitlement];
  // expires_date null = lifetime purchase.
  const pro = !!ent && (ent.expires_date === null || Date.parse(ent.expires_date) > Date.now());

  // Re-check paying users every 10 minutes, non-paying users every minute (so a fresh purchase works fast).
  cache.set(userId, { pro, until: Date.now() + (pro ? 10 : 1) * 60_000 });
  return pro;
}
