import Anthropic from '@anthropic-ai/sdk';

// Reads ANTHROPIC_API_KEY from the environment. The key lives only on this server —
// never ship it inside the mobile app.
export const client = new Anthropic();

/** Model for AI category suggestions and the "reasonable person" question. */
export const ASSESS_MODEL = process.env.ASSESS_MODEL ?? 'claude-opus-5-5';
/** Model for store price checks — the cost-sensitive, high-volume job. */
export const PRICE_MODEL = process.env.PRICE_MODEL ?? 'claude-haiku-5-5';

export const CATEGORIES = ['need', 'must', 'good', 'nice'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Models that support server-side refusal fallbacks. Claude Haiku 5.5 doesn't. */
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2'];

/**
 * Extra request fields per model: if the primary model declines a request, the API
 * transparently retries it on a fallback model.
 */
export function fallbackParams(model: string): {
  betas?: Anthropic.Beta.AnthropicBeta[];
  fallbacks?: 'default';
} {
  return FALLBACK_MODELS.includes(model)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
    : {};
}

/** The dynamic-filtering web search tool isn't available on Claude Haiku 5.5; it uses the basic one. */
export function webSearchTool(model: string, country: string, maxUses: number): Anthropic.Beta.BetaToolUnion {
  const user_location = { type: 'approximate' as const, country };
  return model.startsWith('claude-haiku')
    ? { type: 'web_search_20250305', name: 'web_search', max_uses: maxUses, user_location }
    : { type: 'web_search_20260209', name: 'web_search', max_uses: maxUses, user_location };
}

/** A declined request still costs money, so the cost travels with the error. */
export class ModelRefusal extends Error {
  constructor(message: string, readonly costUsd: number) {
    super(message);
  }
}

export function assertNotRefused(msg: Anthropic.Beta.BetaMessage, costUsd: number) {
  if (msg.stop_reason === 'refusal') {
    throw new ModelRefusal(msg.stop_details?.explanation ?? 'Request declined', costUsd);
  }
}
