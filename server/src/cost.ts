import type Anthropic from '@anthropic-ai/sdk';

/** USD per million tokens. Source: Anthropic pricing, Nov 2026. Keep in sync with the pricing page. */
interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const r = (input: number, output: number, cacheRead: number): Rates => ({
  input,
  output,
  cacheRead,
  cacheWrite: input * 1.25,
});

const RATES: Record<string, Rates> = {
  'claude-opus-5-5': r(4, 20, 0.2),
  'claude-sonnet-5-5': r(2, 10, 0.1),
  'claude-haiku-5-5': r(0.1, 0.5, 0.01),
};
/** Claude Haiku 5.5 bills prompts over 100K tokens at a higher rate card. */
const HAIKU_LONG = r(0.5, 2.5, 0.05);

export const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

export function ratesFor(model: string, promptTokens: number): Rates {
  if (model.startsWith('claude-haiku-5-5') && promptTokens > 100_000) return HAIKU_LONG;
  // Unknown model: assume the most expensive known rates so budgets stay safe.
  return RATES[model] ?? RATES['claude-opus-5-5'];
}

type Usage = Pick<
  Anthropic.Beta.BetaUsage,
  'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens' | 'server_tool_use'
>;

/** Dollar cost of one API response, from the usage the API reports. */
export function costOfResponse(model: string, usage: Usage): number {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const prompt = usage.input_tokens + cacheRead + cacheWrite;
  const rate = ratesFor(model, prompt);
  const tokens =
    (usage.input_tokens * rate.input +
      cacheRead * rate.cacheRead +
      cacheWrite * rate.cacheWrite +
      usage.output_tokens * rate.output) /
    1_000_000;
  const searches = (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
  return tokens + searches;
}
