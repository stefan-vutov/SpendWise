import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { assess, AssessRequest } from './assess.js';
import { checkItem, PriceItem, PriceRequest, PriceResult } from './prices.js';
import { ModelRefusal } from './claude.js';
import { hasPro } from './entitlements.js';
import { UsageStore } from './usage.js';
import { cacheKey, getCached, setCached } from './priceCache.js';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_ITEMS_PER_SCAN = 50;
const usage = new UsageStore();

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, 'Body too large');
  }
  return JSON.parse(raw || '{}');
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** The app sends its RevenueCat user id; the server confirms the subscription with RevenueCat. */
async function requirePro(req: http.IncomingMessage): Promise<string> {
  const userId = str(req.headers['x-user-id'], 128);
  if (!userId) throw new HttpError(401, 'Missing user id');
  if (!(await hasPro(userId))) throw new HttpError(402, 'SpendWise Pro subscription required', 'subscription_required');
  return userId;
}

async function handlePrices(userId: string, body: any) {
  const items: PriceItem[] = (Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS_PER_SCAN) : [])
    .map((i: any) => ({ id: str(i.id, 64), name: str(i.name), targetPrice: num(i.targetPrice), notes: str(i.notes, 300) || undefined }))
    .filter((i: PriceItem) => i.id && i.name);
  const req: PriceRequest = {
    country: str(body.country, 2) || 'US',
    currency: str(body.currency, 3) || 'USD',
    includeInternational: body.includeInternational !== false,
    items,
  };

  const results: (PriceResult & { cached?: boolean; skipped?: 'limit' })[] = [];
  const toCheck: PriceItem[] = [];
  for (const item of items) {
    const cached = getCached(cacheKey(item.name, req.country, req.currency, req.includeInternational));
    if (cached) results.push({ id: item.id, offers: cached, costUsd: 0, cached: true });
    else toCheck.push(item);
  }

  // Items arrive in priority order (Need first). Run up to 3 at a time; each one must
  // reserve a check from the monthly allowance first, so the limit can never be overshot.
  const queue = [...toCheck];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      if (!usage.reservePriceCheck(userId)) {
        results.push({ id: item.id, offers: [], costUsd: 0, skipped: 'limit' });
        continue;
      }
      try {
        const r = await checkItem(req, item);
        usage.addPriceCheckCost(userId, r.costUsd);
        if (!r.error) setCached(cacheKey(item.name, req.country, req.currency, req.includeInternational), r.offers);
        results.push(r);
      } catch (err) {
        if (err instanceof ModelRefusal) usage.addPriceCheckCost(userId, err.costUsd);
        else usage.releasePriceCheck(userId); // nothing was spent (e.g. network/API error): give the check back
        results.push({ id: item.id, offers: [], costUsd: 0, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));

  return {
    // Cost is internal bookkeeping — don't send it to the app.
    results: results.map(({ costUsd: _cost, ...r }) => r),
    usage: usage.summary(userId),
    checkedAt: new Date().toISOString(),
  };
}

async function handleAssess(userId: string, body: any) {
  const input: AssessRequest = {
    name: str(body.name),
    price: num(body.price),
    currency: str(body.currency, 3) || 'USD',
    country: str(body.country, 2) || 'US',
    notes: str(body.notes, 500) || undefined,
    chosenCategory: ['need', 'must', 'good', 'nice'].includes(body.chosenCategory) ? body.chosenCategory : undefined,
  };
  if (!input.name) throw new HttpError(400, 'name is required');
  // Over the monthly AI budget: the app quietly falls back to its on-device suggestion.
  if (!usage.canAssess(userId)) throw new HttpError(429, 'Monthly AI suggestion budget reached', 'limit');
  try {
    const { costUsd, ...out } = await assess(input);
    usage.addAssessCost(userId, costUsd);
    return out;
  } catch (err) {
    if (err instanceof ModelRefusal) usage.addAssessCost(userId, err.costUsd);
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && req.url === '/usage') return send(res, 200, usage.summary(await requirePro(req)));
    if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });

    if (req.url === '/prices') {
      const userId = await requirePro(req);
      return send(res, 200, await handlePrices(userId, await readJson(req)));
    }
    if (req.url === '/assess') {
      const userId = await requirePro(req);
      return send(res, 200, await handleAssess(userId, await readJson(req)));
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message, code: err.code });
    if (err instanceof ModelRefusal) return send(res, 422, { error: err.message });
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Rate limited, try later' });
    if (err instanceof Anthropic.AuthenticationError) return send(res, 500, { error: 'Server API key misconfigured' });
    if (err instanceof Anthropic.APIError) return send(res, 502, { error: `Upstream error ${err.status}` });
    if (err instanceof SyntaxError) return send(res, 400, { error: 'Invalid JSON' });
    console.error(err);
    return send(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, () => console.log(`SpendWise server on http://localhost:${PORT}`));
