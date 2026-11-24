import { client, MODEL, FALLBACK, CATEGORIES, Category, assertNotRefused } from './claude.js';

export interface AssessRequest {
  name: string;
  price: number;
  currency: string;
  country: string;
  notes?: string;
  /** Category the person picked, if any — triggers the "reasonable person" review. */
  chosenCategory?: Category;
}

export interface AssessResponse {
  suggestedCategory: Category;
  confidence: number;
  reasoning: string;
  /** Only present when chosenCategory is need/must. */
  reasonablePerson?: {
    verdict: 'justified' | 'borderline' | 'not_justified';
    challenge: string; // one pointed question back to the user
  };
}

const SYSTEM = `You help people plan purchases and curb impulse spending.
Classify each item into exactly one category:
- need: essential now — health, safety, shelter, food, basic hygiene, or keeping one's income. Going without it causes real harm soon.
- must: required in the near term — something important is broken, blocked or about to fail without it, but not an emergency.
- good: clear practical benefit; life continues fine without it for now.
- nice: a want, treat, luxury, hobby or upgrade of something that still works.

Judge as a sensible, frugal "reasonable person" would, in the person's country. Brand-name or premium versions of an essential item are usually "good" or "nice" unless the premium is necessary. Upgrades of working items are "nice". Be honest but not preachy.
If the person chose need or must themselves, also give a reasonable-person verdict on whether that choice holds up, and one short, specific challenge question (e.g. "Could your current phone last another 6 months with a new battery?").
Keep reasoning to one or two sentences.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestedCategory', 'confidence', 'reasoning', 'verdict', 'challenge'],
  properties: {
    suggestedCategory: { type: 'string', enum: [...CATEGORIES] },
    confidence: { type: 'number', description: '0 to 1' },
    reasoning: { type: 'string' },
    verdict: {
      type: 'string',
      enum: ['justified', 'borderline', 'not_justified', 'not_applicable'],
      description: 'not_applicable unless the person chose need or must',
    },
    challenge: { type: 'string', description: 'Empty string unless verdict applies' },
  },
} as const;

export async function assess(req: AssessRequest): Promise<AssessResponse> {
  const lines = [
    `Item: ${req.name}`,
    `Price: ${req.price} ${req.currency}`,
    `Country: ${req.country}`,
    req.notes ? `Notes from the person: ${req.notes}` : null,
    req.chosenCategory ? `The person placed it in: ${req.chosenCategory}` : 'The person has not chosen a category yet.',
  ].filter(Boolean);

  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    ...FALLBACK,
    system: SYSTEM,
    output_config: {
      effort: 'low', // simple classification — low effort keeps it fast and cheap
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content: lines.join('\n') }],
  });
  assertNotRefused(msg);

  const text = msg.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No assessment returned');
  const out = JSON.parse(text.text) as {
    suggestedCategory: Category;
    confidence: number;
    reasoning: string;
    verdict: 'justified' | 'borderline' | 'not_justified' | 'not_applicable';
    challenge: string;
  };

  const protectedChoice = req.chosenCategory === 'need' || req.chosenCategory === 'must';
  return {
    suggestedCategory: out.suggestedCategory,
    confidence: Math.max(0, Math.min(1, out.confidence)),
    reasoning: out.reasoning,
    reasonablePerson:
      protectedChoice && out.verdict !== 'not_applicable'
        ? { verdict: out.verdict, challenge: out.challenge }
        : undefined,
  };
}
