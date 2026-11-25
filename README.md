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

SpendWise ships as **one free app** with an optional paid upgrade, **SpendWise Pro**, added later.

| Free (on the phone, costs nothing to run) | Pro (paid, needs the hosted server) |
|---|---|
| List, four categories, totals | Automatic daily/weekly price checks at major stores |
| On-device category suggestions | Sale alerts (notifications) |
| "Reasonable person" questions | AI category suggestions and a pointed "do you need it?" question |
| Downgrade reminders | |
| "Search stores for this" link per item | |

How it's wired: `proActive(settings)` in `src/store.ts` turns Pro on only when the app has a server
address **and** `settings.proUnlocked` is true. Development builds skip the payment part so Pro can be tested.
Store builds currently ship with no server address, so they are the free version.

### Steps to launch Pro later
1. Host the `server/` folder online (e.g. Render, Railway, Fly.io) and put its address in `app.json` →
   `expo.extra.apiBaseUrl`.
2. Sell Pro as an in-app subscription. Apple and Google require their own payment systems for digital
   features. RevenueCat (`react-native-purchases`) is the usual choice with Expo; it needs a development build.
3. When a purchase succeeds, set `proUnlocked: true`.
4. Make the server check the subscription on every request (e.g. RevenueCat's API), so only paying users use your AI credit.
5. Price the subscription above your AI cost per user. Each price check is one AI web-search request.

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
export APP_TOKEN=some-long-random-string   # optional shared secret
npm run dev                            # http://localhost:8787
```

The server uses Claude (`claude-opus-5-5` by default; override with `CLAUDE_MODEL`). Price checks use
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
cd server && npx tsc --noEmit
```

## Notes and limits

- **Price scanning cost**: every scanned item is one AI + web-search request. Weekly scanning of a 20-item
  list is about 80 requests a month. The server caps one scan at 25 items.
- Offers in a different currency from yours are ignored for deal alerts.
- Data is stored on the device only (AsyncStorage). There are no accounts or cloud sync yet.
- If you set `APP_TOKEN` on the server, the app needs to send it. Adding that field to Settings is a
  small follow-up.
