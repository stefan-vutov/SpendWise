# SpendWise — purchase planner

A cross-platform (Android + iOS) app built with Expo / React Native that helps people sort what
they want to buy by real need, see what it all adds up to, and curb spontaneous spending.

## Features

| Feature | Where |
|---|---|
| Four categories: **Need to have → Must have → Good to have → Nice to have** | `src/domain/types.ts` |
| Price per item (what you'd pay / found in store), total per category, total overall | `computeTotals` in `src/domain/logic.ts`, home screen |
| Smart category suggestion as you type (AI on the server, on-device fallback offline) | `server/src/assess.ts`, `src/domain/assessment.ts` |
| "Would a reasonable person need this?" check when an item goes into Need/Must (when added *or* moved up) | `src/screens/ReasonablePersonModal.tsx` |
| Daily / weekly / off sale scanning of major stores in your country (+ optional international online retailers), with notifications | `server/src/prices.ts`, `src/services/background.ts` |
| Downgrade prompt when a Need/Must item has waited longer than 1 week, 2 weeks or 1–6 months (you choose) | `isStale` in `src/domain/logic.ts`, `src/screens/DowngradeReviewModal.tsx` |

## Free and Pro

SpendWise is **one free app** with an optional subscription, **SpendWise Pro**.

| Free (runs on the phone, costs you nothing) | Pro (subscription) |
|---|---|
| List, four categories, totals | Automatic daily/weekly price checks at major stores |
| On-device category suggestions | Sale alerts (notifications) |
| "Reasonable person" questions | AI category suggestions and a personal "do you need it?" question |
| Downgrade reminders | 100 item price checks per month |
| "Search stores for this" link per item | |

### Suggested pricing

| | Price | You receive (after 15% store fee*) | Your AI cost per subscriber |
|---|---|---|---|
| Pro monthly | **$4.99 / month** | ≈ $4.24 | typical $0.50–2.50, **never more than $3.75** |
| Pro yearly | **$39.99 / year** (2 months free) | ≈ $34 | same monthly caps |

\*Apple and Google take 15% if you earn under $1M a year (you must sign up for their small-business
programmes) and 30% otherwise. Hosting the server is a separate fixed cost (about $5–10/month).

**Why a subscriber can never cost more than they pay** (`server/src/plans.ts`):
- Price checks use Claude Haiku 5.5: about $0.02–0.04 per item check (most of it is $0.01 per web search; max 3 searches per check).
- 100 checks per month, *and* a hidden $3.00 cap on real measured cost. Whichever comes first stops checks until the 1st of next month.
- AI suggestions (Claude Opus 5.5, about $0.02 each) have their own $0.75 monthly cap; after that the on-device suggestion is used.
- The same item checked in the same country within 24 hours is served from a shared cache: free, and not counted.
- The server measures the real cost of every call from the API's usage report.
- Items are checked in priority order (Need to have first), so the allowance goes to what matters most.

### How it's wired
- `proActive(settings)` (`src/store.ts`) turns Pro features on when a server is configured and the person has the `pro` entitlement. Development builds skip the payment check for testing.
- `src/services/purchases.ts` handles subscriptions through RevenueCat. `src/screens/PaywallModal.tsx` is the upgrade screen, with Restore purchases (Apple requires it).
- The server re-checks every request with RevenueCat (`server/src/entitlements.ts`), so a modified app can't get Pro for free.
- With empty keys in `app.json`, the app is the free version and shows Pro as "coming soon".

### Launch checklist for Pro
1. **Host the server** (Render, Railway, Fly.io…) with a persistent disk for `DATA_DIR`. Set environment variables:
   `ANTHROPIC_API_KEY`, `REVENUECAT_SECRET_KEY`, `DATA_DIR`. Optional: `PRICE_MODEL` (default `claude-haiku-5-5`) and `ASSESS_MODEL` (default `claude-opus-5-5`).
2. **Create the subscriptions in the stores**: App Store Connect (auto-renewable subscription group "SpendWise Pro") and Google Play Console. Add monthly and yearly products with the prices above.
3. **Set up RevenueCat** (free until $2.5K monthly revenue): add both apps, create entitlement `pro`, attach both products, and create a default offering with Monthly and Annual packages.
4. **Fill `app.json` → `expo.extra`**: `apiBaseUrl` (hosted server), `revenueCatAppleKey`, `revenueCatGoogleKey` (public SDK keys), `termsUrl`, `privacyUrl`.
5. **Build with EAS** (`npx eas-cli@latest build`). Real purchases don't work in Expo Go, so test with store sandbox/test accounts on a development build.

To change limits or caps, edit `server/src/plans.ts`. The app reads the allowance from the server.

## Layout

```
App.tsx, index.ts          app entry (index.ts also registers the background task)
src/domain/                pure logic + unit tests (no React Native imports)
src/services/              API client, background scan + notifications
src/screens/, components/  UI
server/                    small Node server: AI assessment + price search (holds the API key)
```

## Running it

### 1. Server (needed for smart assessment and price scanning)

```bash
cd server
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # never put this in the app
export DEV_ALLOW_ALL=1                 # local testing only: treat everyone as Pro
npm run dev                            # http://localhost:8787
```

The server uses Claude Haiku 5.5 for price checks and Claude Opus 5.5 for AI suggestions (override with `PRICE_MODEL` / `ASSESS_MODEL`). Price checks use
Claude's web search, focused on your country, and only report offers it actually found in search results.

### 2. App

```bash
npm install
npx expo start
```

Open in a development build on a phone or simulator. In the app go to **Settings → Server** and enter
your server's address (from a phone, use your computer's LAN IP, e.g. `http://192.168.1.20:8787`,
not `localhost`). Set your country and currency there too.

Background tasks and scheduled notifications need a **development build** (`npx expo run:android`,
`npx expo run:ios`, or `npx eas-cli@latest build`); they don't run in Expo Go. The OS decides exactly when
background work runs; the app also runs any due check each time it's opened.

### Tests

```bash
npx jest          # domain logic
npx tsc --noEmit  # app typecheck
cd server && npx tsc --noEmit && npm test
```

## Notes and limits

- **Price scanning cost**: see "Suggested pricing" above. The server caps one scan at 50 items.
- Offers in a different currency from yours are ignored for deal alerts.
- Data is stored on the device only (AsyncStorage). There are no accounts or cloud sync yet.
