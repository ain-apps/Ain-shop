# AIN Shop — native Android app

Voice-only shopping for blind shoppers, built natively in Kotlin with
Jetpack Compose. **This is NOT a WebView wrapper**: every screen is
built in Compose, and the website code (in `../ain-shop-shared/web/`)
is only the reference for features, voice commands and API shapes — it is
never loaded here.

Shared codebase: this app is one of three platforms fed by the shared
layer in `../ain-shop-shared/` (see `../ain-shop-shared/README.md`). The
address and the endpoint paths come from the shared contract
(`config.json` + `api-contract.json`) via the generated
`app/src/main/java/com/ainshop/app/data/ApiEndpoints.kt` — never edit
that file by hand; change the shared files and re-run
`../ain-shop-shared/tools/generate-android-api.mjs`. The full contract
is in `../ain-shop-shared/api-contract.md`.

Version **1.0.1** (versionCode 102), minSdk 24, targetSdk 34.
Package placeholder: **`com.ainshop.app` — must be confirmed against the
Google Play listing before release** (see "Still needs the user" below).

## How to build

```bash
# 1. Fetch the vendored sherpa-onnx AAR (on-device Whisper; not on Maven).
bash scripts/fetch-sherpa-onnx.sh

# 2. Build.
./gradlew assembleDebug

# 3. Install on a phone.
./gradlew installDebug
```

Android Studio: open this folder, let Gradle sync, run `app`.

**No secrets, no API keys anywhere in this project.** The server
(`https://ain-shop.natimedwed.workers.dev`) holds the keys; the app sends
only the shopper's words. The owner PIN is also never stored on the phone
— only the 30-day session cookie the server returns (see "Owner page").

## What the app does

**Voice-first core.** Everything by speech, no screen needed: she talks,
describes, asks questions, gives prices and stock, back and forth like a
person. Live voice is the main experience (Android speech recognition
on-device where possible, Whisper on the phone as the backup for languages
the phone's own hearing doesn't cover — no training anything, models used
as they are). Every button works by voice. 50 languages for listening and
speaking. Full TalkBack labels on everything, big touch targets (64–96 dp).

**Search.** Voice search across the whole web, not one store. The app says
how many results were found ("we found 30 results, here are the top
three"), shows the top 3, more by voice ("next", "more") or scrolling.
Speed: the first 3 are spoken fast while the rest keep checking, with a
15-second cap so a search never hangs; repeat searches use a short
~5-minute cache, then go live again. Conversation spine: "the second one" /
"the cheaper one" works. The server's fixed matching (category gate,
synonym groups, wrong items removed not demoted — 496/509 tested — plus the
bicycle accessory rule) is inherited by calling the same backend.
Natural-language commands in any of 50 languages; the app confirms by
voice before buy / pay / delete. Favorite stores are checked first.

**Shopping.** Barcode scan (phone's own detector first, ZXing bundled as
fallback; EAN-13, EAN-8, UPC-A, UPC-E, QR, Code 39, Code 128, ITF, Data
Matrix, PDF 417). Knowing what a number is: taught on this phone first,
then the shared memory, then the server's ordered lookup (Open Food Facts
family, then UPCitemdb's free trial), then a whole-web search for the
number — and if nothing finds it, the digits are read aloud digit by
digit and the shopper can teach it. Camera "what is this?": auto-capture
after 2 seconds still, or on "take it"; a barcode in the photo wins (it is
exact); otherwise the vision AI describes only what is visible, as an
impression ("from the picture it looks like…"), never guessing brand, size
or price; photos are never stored. Stores near you (location asked once,
only ZIP/town saved). Shopping list and Buy again lists, reorder shortcuts.
Price-drop watchlist with voice alerts and a daily spoken roundup.
Spoken deals summary across favorite stores. Voice feedback ("helpful /
not helpful", phone only) and report-a-mistake teaching records (phone
only). Location choice by voice ("near me" = saved place; "I'm looking to
buy in England" searches in that country instead; no place said = saved
location). "Fastest delivery"; delivery times read verbatim from the
store's page, never guessed; tracking opens the store's own page. Buying
opens the store's own page; the app never sees the card.

**New in this build, all approved 2026-11-20.**
- **Picture-in-picture mini window** (like YouTube): `MainActivity` has
  PiP support; pressing Home during a voice session shrinks to a small
  floating window and the app keeps talking; voice controls still work
  there, tap (or "Full screen") returns to full screen.
- **Phone-call handling**: an incoming call pauses the voice (stops
  speaking and listening); when the call ends the app resumes exactly
  where it left off — same search, same results, nothing lost (the last
  session is saved on the phone and restored if under 24 hours old).
- **Read reviews aloud**: "what do buyers say about this?" speaks the
  rating and count plus a short good-and-bad summary. The server returns
  no review text, so the summary comes from the listing (description and
  highlights) plus a clearly labelled web search for the product's
  reviews; when reviews can't be read, the app says so. Never invented.
- **Compare by voice**: "compare the first one and the second one" speaks
  price, rating, stock, delivery and key differences side by side.
- **Coupons**: a web search for a coupon or deal code, read out with the
  warning that codes might not work at checkout. Never invented.
- **Call the store by voice**: "call Walmart" opens the dialer with the
  store's public number (verified 2026-11-20 for 11 stores; the rest have
  no number and the app says so). The app never dials by itself.
- **Price history**: "was this cheaper before?" — only from prices the app
  has actually seen (searches and the watchlist on this phone). If it has
  never seen the item, it says so.
- **Tell me about the store**: "tell me about Walmart" speaks the nearest
  location, hours, phone, pickup and delivery, and whether it is
  online-only (Amazon, eBay, Etsy, Chewy — never given a made-up address).
  Location counts come from a live web search, read back verbatim. Any
  unknown fact is said as unknown, never guessed.
- **Remember my size**: men's clothing first (shirt, pants, shoes), saved
  on the phone only, used when shopping for clothes ("show me shirts in
  my size"), changeable by voice any time. Never guessed.
- **Return windows read aloud**: "how long do I have to return this?"
  speaks the store's return window, verified 2026-11-20 for 14 stores
  (e.g. Walmart 90 days, Costco no time limit most items, IKEA 365 days
  unopened); unknown stores say "I don't know — the store's own page is
  the final word". Policies change.
- **Back-in-stock alerts**: "tell me when it's back" watches an
  out-of-stock item; a background check every 6 hours (WorkManager,
  network only) notifies the shopper, and tapping the notification opens
  the app, which reads the news aloud.
- **Shared pure memory**: one shared entry per item (name, brand,
  barcode, photo facts, price and price history, where to buy, aisle /
  shelf, reviews summary, allergens / ingredients). The app checks the
  shared memory first for instant answers, falls back to live search for
  new items, then remembers what it found. Photos are never stored or
  shared — only the facts they revealed. Aisles are user-taught only,
  never guessed. Pure = item facts only: no sizes, lists, purchases,
  location or names; a user-taught fact is shared only after that user
  confirms it, and the toggle in Settings turns sharing off. Personal
  memory stays on the phone only.
- **Owner usage page**: counts only, never who — visitors per day (new
  vs returning), searches per day, platform (iPhone / Android / web),
  all readable by voice ("read the numbers"). Behind the same owner PIN
  as the website's `/admin` page (see "Owner API" below).

**NOT built, on purpose:** the slippers rule (still awaiting his yes/no);
always-listening wake word (the app listens when opened, not all day);
the $4.99/month subscription (exists in the site code, stays OFF).

## Feature coverage

| Feature | Where | Notes |
|---|---|---|
| Voice search, whole web, top 3 + count | `ui/AppViewModel.kt`, `data/AinShopApi.kt` | 15 s cap, 5-min cache, partial polling |
| Conversation spine ("the second one") | `voice/ConversationState.kt` | |
| 50 languages | `data/Languages.kt` | on-device SR + TTS + Whisper fallback |
| Barcode: read + know | `ui/screens/BarcodeScreen.kt`, `barcode/` | ML Kit live, ZXing still-photo fallback |
| Camera "what is this?" | `ui/screens/IdentifyScreen.kt`, `camera/SteadyDetector.kt` | steady auto-capture, barcode first, photo never stored |
| Stores near you | `data/AinShopApi.kt` (`/api/shop/nearby`) | ZIP/town only |
| Shopping list / Buy again / reorder | `ui/screens/ListsScreen.kt` | on-phone only |
| Watchlist, price drops, daily roundup | `data/PriceCheckWorker.kt` | 6-hourly background check |
| Favorite stores first | `data/LocalStore.kt` (max 10) | |
| Deals summary | `AppViewModel.dealsSummary()` | max 5 favorites, was-price deals only |
| Voice feedback / report-a-mistake | `AppViewModel` | on-phone only |
| Location choice (near me / England) | `AppViewModel.searchWithPlace()` | saved place, or a named country |
| PiP mini window | `ui/pip/PipController.kt`, `ui/screens/MiniWindowScreen.kt` | Android PiP mode |
| Phone-call pause + resume | `voice/CallHandler.kt` | saves session snapshot, restores it |
| Reviews read aloud | `voice/ReviewsReader.kt` | no review text from server — labelled web search |
| Compare by voice | `voice/Comparison.kt` | price, rating, stock, delivery, differences |
| Coupons | `voice/CouponFinder.kt` | web search, "might not work" warning |
| Call the store | `data/StoreDirectory.kt` (verified numbers) | dialer opens, never auto-dials |
| Price history | `data/LocalStore.kt` (price sightings) | only prices actually seen |
| Tell me about the store | `voice/StoreInfo.kt` | online-only named, unknowns said as unknown |
| Remember my size | `data/LocalStore.kt` (`MySizes`) | men's first, on-phone only |
| Return windows | `data/StoreDirectory.kt` | verified 2026-11-20, unknown = "I don't know" |
| Back-in-stock alerts | `data/PriceCheckWorker.kt` | |
| Shared pure memory | `data/SharedMemory.kt`, `data/SharedMemoryApi.kt` | client side only — server side pending |
| Owner usage page | `ui/screens/OwnerScreen.kt`, `data/OwnerApi.kt`, `data/OwnerStats.kt` | PIN-protected, counts only |
| TalkBack / large targets | `ui/components/Components.kt`, all screens | 64–96 dp targets, content descriptions |

## Server contracts the app is built against

Base URL: `https://ain-shop.natimedwed.workers.dev` (no key in the app).
The address and every endpoint below come from the shared contract —
see `../ain-shop-shared/api-contract.json` and the generated
`app/src/main/java/com/ainshop/app/data/ApiEndpoints.kt`. Change a route
in the shared contract first, then re-run the generator; never edit the
endpoint strings here by hand.

- `POST /api/shop/search` — query, stores, min/max price, near, near_me,
  country, currency, fast, fresh, zip, loc. Returns query, products,
  total, partial, searched_at. The server holds the fixed matching
  (496/509) and the bicycle accessory rule.
- `GET /api/shop/store`, `/api/shop/details`, `/api/shop/barcode`,
  `/api/shop/identify`, `/api/shop/nearby`, `/api/ai/intent` — as in the
  site code. `/api/shop/barcode` already does the ordered lookup (Open
  Food Facts family → UPCitemdb free trial, server-capped at 90/day) with
  GTIN check-digit validation.
- **Shared memory (client built; server side NOT built yet).** The app
  calls `GET /api/memory/lookup?barcode=` or `?query=`, and
  `POST /api/memory/teach` (body: entry + origin "web" | "photo" |
  "user"). Any 404 or failure is treated as "not available" and the app
  falls back to live search — so the feature switches itself on the day
  the endpoints land. Entry shape: `SharedMemoryEntry` in
  `data/SharedMemory.kt` (key, name, brand, barcode, quantity, category,
  photoFacts, offers, priceHistory, aisles, reviewsSummary, rating,
  reviews, allergens, traces, ingredients, origin, updatedAt). The
  server must enforce the same rules: item facts only, never personal,
  photos never stored.
- **Owner API (live on the server).**
  `POST /api/owner/login {pin}` → sets a 30-day `bain_owner` session
  cookie (HttpOnly, Secure). `GET /api/owner/usage` → 7 days of
  `{day, spent_cents, sessions, minutes, searches}` plus `visitors`
  (today / today_new / today_returning / week / all_time / by_day[14] /
  by_platform / test_hits). `POST /api/owner/logout`. Wrong PINs are
  rate-limited server-side (5 per hour, 100 per day site-wide); the app
  shows tries left and the lock message. The PIN is 6–12 digits, never
  stored on the phone — only the session cookie is kept, in private
  storage.
  - **What the server does NOT count yet** (checked 2026-11-20 in
    `../ain-shop-shared/web/_worker.js`): barcode scans per day, most-searched items,
    most-tapped buy buttons, and a language breakdown. The app says so
    plainly on the owner page and in the spoken numbers, and already
    reads `barcode_scans`, `most_searched`, `most_tapped_buy` and
    `by_lang` when present, so those numbers appear the day the server
    starts counting them — no app update needed.

## Honest limits — read before the first build

- **This app has never been compiled.** There is no Java, Gradle or
  Android SDK in the environment it was written in. The first
  `./gradlew assembleDebug` is the real compile test; expect to fix
  small things (see the next two points).
- **sherpa-onnx Java API names** in `voice/WhisperFallback.kt` must be
  confirmed against the vendored 1.13.3 Javadoc at first build — the
  file is written from the documented API, not from a compiled check.
- **Review text is not available from the server** (`/api/shop/details`
  returns rating, count, description and highlights, but no review
  text). Reviews-read-aloud therefore uses a labelled web search and
  says plainly when reviews can't be read.
- **Coupon codes come from the web and may not work at checkout** — the
  app warns about this every time.
- **UPCitemdb is server-side** (trial endpoint, 90 lookups/day cap on the
  server). No barcode service was signed up or paid for.
- **Shared-memory server endpoints do not exist yet** (`/api/memory/*`).
  The client falls back to live search until they do.
- **Owner stats gaps**: barcode scans per day, most-searched items,
  most-tapped buy buttons and language breakdown are not counted by the
  server yet (see above).
- **Global scale** (100,000 people at once) is a server/budget question,
  not something this client can prove: on-device listening removes the
  voice bottleneck, but OpenAI spend and rate limits still bind
  (~$25/day budget, ~18c/search, ~139 searches/day at current pricing).
- The `slippers` rule was deliberately NOT applied (awaiting his yes/no).

## Still needs the user

1. **applicationId confirmation** — `com.ainshop.app` is a placeholder.
   Check it against the Google Play listing before release.
2. **First Gradle build test** — run `./gradlew assembleDebug` on a
   machine with the Android SDK (or Android Studio) and fix what it
   finds.
3. **Play signing key** — the app is unsigned here; signing and upload
   to Google Play are his steps, with his Play account.
4. **Shared-memory server side** — build `GET /api/memory/lookup` and
   `POST /api/memory/teach` on the Cloudflare worker to match the
   contract above.
5. **Owner PIN** — set it on the website's owner page if it was never
   set; the app's owner page uses the same PIN. (The Tab PIN does not
   work on the new site.)
6. **Owner stats gaps** (optional) — if he wants barcode scans per day,
   most-searched items, most-tapped buy buttons or a language breakdown,
   the server has to start counting them; the app already reads them.

## Project layout

```
app/src/main/java/com/ainshop/app/
  MainActivity.kt            one activity: permissions, intents, PiP
  AinShopApp.kt              schedules the background price/stock checker
  data/                      Models, AinShopApi, LocalStore, Languages,
                             StoreDirectory (verified phones + returns),
                             SharedMemory(+Api), OwnerApi(+Stats),
                             PriceCheckWorker
  voice/                     SpeechEngine, WhisperFallback, VoiceCommands
                             (the parser), ConversationState, CallHandler,
                             Comparison, ReviewsReader, CouponFinder,
                             StoreInfo
  barcode/                   BarcodeReader (ML Kit + ZXing fallback),
                             ZxingFallback
  camera/                    SteadyDetector (auto-capture when still)
  ui/                        AppViewModel (the whole orchestrator),
                             components/ (BigButton, TalkButton,
                             SpokenText, ProductCard, ListRow),
                             screens/ (Home, Results, Barcode, Identify,
                             Lists, Stores, Settings, Owner, MiniWindow),
                             pip/PipController, theme/
  util/                      Money (spoken prices)
scripts/fetch-sherpa-onnx.sh  downloads the vendored Whisper AAR
```
