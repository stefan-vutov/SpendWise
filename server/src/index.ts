import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { assess, AssessRequest } from './assess.js';
import { checkPrices, PriceRequest } from './prices.js';
import { ModelRefusal } from './claude.js';

const PORT = Number(process.env.PORT ?? 8787);
/** Optional shared secret. Set APP_TOKEN in production so strangers can't spend your API credit. */
const APP_TOKEN = process.env.APP_TOKEN;
const MAX_ITEMS_PER_SCAN = 25;

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('Body too large');
  }
  return JSON.parse(raw || '{}');
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });
    if (APP_TOKEN && req.headers.authorization !== `Bearer ${APP_TOKEN}`) {
      return send(res, 401, { error: 'Unauthorized' });
    }
    const body = await readJson(req);

    if (req.url === '/assess') {
      const input: AssessRequest = {
        name: str(body.name),
        price: num(body.price),
        currency: str(body.currency, 3) || 'USD',
        country: str(body.country, 2) || 'US',
        notes: str(body.notes, 500) || undefined,
        chosenCategory: ['need', 'must', 'good', 'nice'].includes(body.chosenCategory) ? body.chosenCategory : undefined,
      };
      if (!input.name) return send(res, 400, { error: 'name is required' });
      return send(res, 200, await assess(input));
    }

    if (req.url === '/prices') {
      const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS_PER_SCAN) : [];
      const input: PriceRequest = {
        country: str(body.country, 2) || 'US',
        currency: str(body.currency, 3) || 'USD',
        includeInternational: body.includeInternational !== false,
        items: items
          .map((i: any) => ({ id: str(i.id, 64), name: str(i.name), targetPrice: num(i.targetPrice), notes: str(i.notes, 300) || undefined }))
          .filter((i: { id: string; name: string }) => i.id && i.name),
      };
      return send(res, 200, { results: await checkPrices(input), checkedAt: new Date().toISOString() });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (err) {
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
