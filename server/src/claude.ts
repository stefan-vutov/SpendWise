import Anthropic from '@anthropic-ai/sdk';

// Reads ANTHROPIC_API_KEY from the environment. The key lives only on this server —
// never ship it inside the mobile app.
export const client = new Anthropic();

export const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';

/** If the primary model declines a request, the API transparently retries on a fallback model. */
export const FALLBACK = {
  betas: ['server-side-fallback-2026-07-01'] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: 'default' as const,
};

export const CATEGORIES = ['need', 'must', 'good', 'nice'] as const;
export type Category = (typeof CATEGORIES)[number];

export class ModelRefusal extends Error {}

export function assertNotRefused(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === 'refusal') {
    throw new ModelRefusal(msg.stop_details?.explanation ?? 'Request declined');
  }
}
