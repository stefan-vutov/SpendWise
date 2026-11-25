/**
 * What a SpendWise Pro subscriber gets each calendar month (UTC).
 *
 * Budget maths for the suggested $4.99/month price:
 *   $4.99 − store fee (15% for small developers, 30% otherwise) ≈ $3.49–$4.24 you receive.
 *   Price checks (Haiku 5.5): ~$0.02–0.04 each → 100 checks ≈ $2–4, hard-capped at $3.00.
 *   AI suggestions (Opus 5.5): ~$0.02 each, hard-capped at $0.75 (then on-device suggestions).
 * Worst case a subscriber costs $3.75 a month; a typical one costs far less. Change these numbers
 * here at any time — the app reads them from the server.
 */
export const PRO_PLAN = {
  /** RevenueCat entitlement identifier that unlocks Pro. */
  entitlement: 'pro',
  /** Item price checks per month (one item at one moment = one check; shared cache hits are free). */
  monthlyPriceChecks: 100,
  /** Hidden safety caps on real measured cost, in US dollars. */
  monthlyPriceCheckCostCapUsd: 3.0,
  monthlyAssessCostCapUsd: 0.75,
} as const;
