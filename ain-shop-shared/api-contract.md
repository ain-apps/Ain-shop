# AIN Shop — API contract (human-readable)

The machine-readable version is `api-contract.json`. Change a route there
AND in `web/_worker.js` together, then run `tools/verify-shared.mjs`.

Base URL for everything: `https://ain-shop.natimedwed.workers.dev`
(see `config.json`). The server holds the OpenAI key; no app ever sends one.

## Shop (website + Android)

| Route | Method | What it does |
|---|---|---|
| `/api/shop/search` | POST | Whole-web product search. Fixed matching (496/509), top 3 + count, 5-minute cache, 15-second first-answer cap. |
| `/api/shop/store` | POST | Search one store's own site. |
| `/api/shop/details` | POST | Product details from the store's own page. |
| `/api/shop/identify` | POST | Camera "what is this?" — a photo in, a description out. Photo never stored. |
| `/api/shop/barcode` | POST | Barcode to product: Open Food Facts, then UPCitemdb, then one whole-web search for the digits. Never invented. |
| `/api/shop/nearby` | POST | Stores near a saved place, or in a named country. |
| `/api/shop/storeinfo` | POST | Facts about a store. Unknown stays unknown. Website only. |
| `/api/shop/memory` | POST | Shared pure memory lookup. Website only. |
| `/api/shop/memory/share` | POST | Share a taught item fact (needs `confirmed:true`). Website only. |
| `/api/shop/usage/buy` | POST | Buy-tap beacon (item words + store only). Website only. |
| `/api/shop/checkout` | POST | Prepare checkout on the store's page. Website only. |

## Voice + status (website)

| Route | Method | What it does |
|---|---|---|
| `/api/ai/session` | POST | Open a live voice session. |
| `/api/ai/heartbeat` | POST | Keep a live voice session alive. |
| `/api/ai/end` | POST | End a live voice session. |
| `/api/ai/fail` | POST | Phone reports a voice call gave up. |
| `/api/ai/intent` | POST | Natural-language command the phone parser doesn't know (any of 50 languages). Website + Android. |
| `/api/ai/status` | GET | Voice-call status. |
| `/api/status` | GET | Server health. |
| `/api/geo` | GET | Approximate place from the request. |
| `/api/geo/reverse` | GET | Place name for latitude/longitude. |
| `/api/hit` | POST | Usage-counting beacon (counts only). |
| `/api/stores/partners` | GET | Affiliate partner store list. |
| `/api/join` | POST | A store joins itself; waits for owner approval. |

## Owner (website + Android)

| Route | Method | What it does |
|---|---|---|
| `/api/owner/login` | POST | Owner PIN login; sets a 30-day session cookie. |
| `/api/owner/logout` | POST | Clear the owner session. |
| `/api/owner/usage` | GET | Usage numbers — counts only, no names. |
| `/api/owner/stores` | GET | Owner's list of joined stores. Website only. |
| `/api/owner/status` | POST | Approve / reject a store. Website only. |

## Drift — read this before changing memory

Android calls `GET /api/memory/lookup` and `POST /api/memory/teach`. The
server does NOT have those paths; it has `/api/shop/memory` and
`/api/shop/memory/share`. Android treats the 404 as "no shared memory yet"
and falls back to live search, so nothing breaks — but shared memory never
switches on for Android until the paths are lined up. Either the server
adds the two `/api/memory/*` routes, or the Android client is pointed at
the `/api/shop/memory*` routes (their request/response shapes differ, so
that is a small code change, not a rename).

## Switched off

- `/api/sub/*` (status, subscribe, cancel, restore) — the $4.99
  subscription is built but off; the routes answer `paywall_off`.
- `/api/pay/*/webhook` (Stripe, App Store, Google Play) — payment
  webhooks; not used while the paywall is off.

## Setup only (not used by the apps at runtime)

`/api/admin/*` — `key`, `walmart_key`, `config`, `usage`, `pin`,
`stores_test_cleanup`, `sub_set`, `purge`, `unlock`, `diag`, `calls`.
All POST. Used once during setup with the setup phrase.
