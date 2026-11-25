import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOfResponse } from './cost.js';
import { UsageStore } from './usage.js';
import { PRO_PLAN } from './plans.js';

const usage = (input: number, output: number, searches = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 } as any,
});

test('typical Haiku price check costs a few cents', () => {
  // ~30K tokens of search results read, 2K written, 2 searches
  const c = costOfResponse('claude-haiku-5-5', usage(30_000, 2_000, 2));
  assert.ok(Math.abs(c - (0.003 + 0.001 + 0.02)) < 1e-9, String(c));
});

test('Haiku long prompts use the higher rate card', () => {
  const c = costOfResponse('claude-haiku-5-5', usage(200_000, 0));
  assert.ok(Math.abs(c - 0.1) < 1e-9, String(c));
});

test('unknown models are priced conservatively (Opus rates)', () => {
  assert.equal(costOfResponse('some-new-model', usage(1_000_000, 0)), 4);
});

test('monthly check limit cannot be exceeded', () => {
  const store = new UsageStore(null);
  for (let i = 0; i < PRO_PLAN.monthlyPriceChecks; i++) assert.ok(store.reservePriceCheck('u1'));
  assert.equal(store.reservePriceCheck('u1'), false);
  assert.equal(store.summary('u1').priceChecksLeft, 0);
  assert.ok(store.reservePriceCheck('u2'), 'other users unaffected');
});

test('hidden dollar cap stops checks even with checks left', () => {
  const store = new UsageStore(null);
  assert.ok(store.reservePriceCheck('u1'));
  store.addPriceCheckCost('u1', PRO_PLAN.monthlyPriceCheckCostCapUsd);
  assert.equal(store.reservePriceCheck('u1'), false);
});

test('released checks are returned and usage resets each month', () => {
  const store = new UsageStore(null);
  store.reservePriceCheck('u1');
  store.releasePriceCheck('u1');
  assert.equal(store.summary('u1').priceChecksUsed, 0);
  store.reservePriceCheck('u1');
  const nextMonth = new Date(Date.now() + 40 * 24 * 3600 * 1000);
  assert.equal(store.summary('u1', nextMonth).priceChecksUsed, 0);
});

test('assessment budget cap', () => {
  const store = new UsageStore(null);
  assert.ok(store.canAssess('u1'));
  store.addAssessCost('u1', PRO_PLAN.monthlyAssessCostCapUsd);
  assert.equal(store.canAssess('u1'), false);
});
