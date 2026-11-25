import Anthropic from '@anthropic-ai/sdk';
import { client, PRICE_MODEL, fallbackParams, webSearchTool, assertNotRefused } from './claude.js';
import { costOfResponse } from './cost.js';

export interface PriceItem {
  id: string;
  name: string;
  /** What the person is willing to pay. */
  targetPrice: number;
  notes?: string;
}

export interface PriceRequest {
  country: string; // ISO alpha-2
  currency: string;
  includeInternational: boolean;
  items: PriceItem[];
}

export interface Offer {
  store: string;
  price: number;
  currency: string;
  url?: string;
  onSale: boolean;
}

export interface PriceResult {
  id: string;
  offers: Offer[];
  error?: string;
  /** Measured cost of this check in USD. */
  costUsd: number;
}

const REPORT_TOOL: Anthropic.Beta.BetaTool = {
  name: 'report_prices',
  description:
    'Report the current offers you found for the item. Call exactly once, after searching, with every credible offer you verified.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['offers'],
    properties: {
      offers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['store', 'price', 'currency', 'url', 'onSale'],
          properties: {
            store: { type: 'string' },
            price: { type: 'number', description: 'Current price for the new item, including any discount, excluding shipping' },
            currency: { type: 'string', description: 'ISO 4217 code' },
            url: { type: 'string', description: 'Product page URL taken from a search result' },
            onSale: { type: 'boolean', description: 'True if the retailer shows it as discounted / on sale' },
          },
        },
      },
    },
  },
};

function systemPrompt(req: PriceRequest) {
  return `You check current retail prices for a shopping-list app.
Search major retailers that sell to shoppers in ${req.country}${
    req.includeInternational ? ', plus large international online retailers that ship there' : ' only'
  }. Prices should be in ${req.currency}; if a store only lists another currency, report that currency as-is.
Only report offers you actually saw in search results for the same product (same model/size; new, not used or refurbished). Never guess a price or invent a URL. Report at most 6 offers, cheapest first. If you find nothing reliable, call report_prices with an empty list.`;
}

/** Search the web for one item's current prices. */
export async function checkItem(req: PriceRequest, item: PriceItem): Promise<PriceResult> {
  // 3 searches is plenty for one product and keeps each check cheap ($0.01 per search).
  const tools: Anthropic.Beta.BetaToolUnion[] = [webSearchTool(PRICE_MODEL, req.country, 3), REPORT_TOOL];
  let costUsd = 0;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: `Item: ${item.name}${item.notes ? `\nDetails: ${item.notes}` : ''}\nThe person is willing to pay ${item.targetPrice} ${req.currency}. Find current prices, then call report_prices.`,
    },
  ];

  let nudged = false;
  for (let turn = 0; turn < 6; turn++) {
    const msg = await client.beta.messages.create({
      model: PRICE_MODEL,
      max_tokens: 16000,
      ...fallbackParams(PRICE_MODEL),
      system: systemPrompt(req),
      output_config: { effort: 'low' }, // reading prices off search results needs little reasoning
      tools,
      messages,
    });
    costUsd += costOfResponse(PRICE_MODEL, msg.usage);
    assertNotRefused(msg, costUsd);

    const report = msg.content.find((b) => b.type === 'tool_use' && b.name === 'report_prices');
    if (report && report.type === 'tool_use') {
      const input = report.input as { offers?: Offer[] };
      const offers = (input.offers ?? []).filter(
        (o) => typeof o.price === 'number' && o.price > 0 && typeof o.store === 'string',
      );
      return { id: item.id, offers, costUsd };
    }

    // Keep the full assistant turn (including thinking and search results) in history.
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue; // long server-side search turn: resume it
    if (nudged) break;
    nudged = true;
    messages.push({ role: 'user', content: 'Please call report_prices now with what you found.' });
  }
  return { id: item.id, offers: [], error: 'No price report produced', costUsd };
}
