# AIN Shop — feature registry

One row per feature. Website paths are inside `ain-shop-shared/web/`.
Android paths are inside `ain-shop-android-app/app/src/main/java/com/ainshop/app/`.
iPhone gets almost everything through the website, so its column usually just
says "website — no wrapper change". Status is **built** (in the code),
**built-android** (only on Android so far), or **built-with-drift** (built,
with a known mismatch to fix). Nothing here is live until it is deployed —
see `UPDATE-FLOW.md`.

| Feature | Website | Android | iPhone |
|---|---|---|---|
| Whole-web search (top 3 + count) | `_worker.js`, `app.js`, `ai.js` | `data/AinShopApi.kt`, `ui/AppViewModel.kt` | Website, no wrapper change |
| Live voice conversation | `ai.js`, `app.js` | `voice/SpeechEngine.kt`, `voice/WhisperFallback.kt`, `ui/AppViewModel.kt` | Website, no wrapper change; wrapper adds the audio session |
| On-device listening + Whisper fallback | Live voice call only (on-device listening not in the website yet) | `voice/SpeechEngine.kt`, `voice/WhisperFallback.kt` | Website |
| Barcode scan | `barcode.js`, `_worker.js` | `barcode/BarcodeReader.kt`, `barcode/ZxingFallback.kt`, `ui/screens/BarcodeScreen.kt` | Website, no wrapper change; wrapper grants the camera |
| Camera "what is this?" | `ai.js`, `_worker.js` | `camera/SteadyDetector.kt`, `ui/screens/IdentifyScreen.kt` | Website, no wrapper change; wrapper grants the camera |
| Stores near you + location choice | `location.js`, `stores.js`, `_worker.js` | `data/AinShopApi.kt`, `voice/StoreInfo.kt` | Website, no wrapper change |
| Voice shopping list, Buy again, reorder | `shoppinglist.js`, `reorder.js`, `history.js` | `ui/screens/ListsScreen.kt`, `ui/AppViewModel.kt` | Website, no wrapper change |
| Watchlist, price-drop alerts, daily roundup | `watchlist.js`, `roundup.js` | `data/PriceCheckWorker.kt`, `data/LocalStore.kt`, `ui/AppViewModel.kt` | Website, no wrapper change |
| Favorite stores first + deals summary | `dealssummary.js`, `favorites.js` | `data/LocalStore.kt`, `ui/AppViewModel.kt` | Website, no wrapper change |
| Natural-language commands, 50 languages | `intent.js`, `vcmd.js`, `vcmd-i18n.js`, `i18n.js` | `voice/VoiceCommands.kt`, `data/Languages.kt` | Website, no wrapper change |
| Voice feedback ("helpful / not helpful") | `feedback.js` | `voice/VoiceCommands.kt` | Website, no wrapper change |
| Conversation spine ("the second one") | `conversation.js` | `voice/ConversationState.kt` | Website, no wrapper change |
| Mini floating window + phone-call pause | `miniplayer.js`, `callpause.js`, `ai.js` | `ui/pip/PipController.kt`, `voice/CallHandler.kt`, `ui/screens/MiniWindowScreen.kt`, `MainActivity.kt` | Wrapper change: `WebView.swift` (PiP, audio interruption), `Info.plist` (audio background mode) |
| Reviews read aloud | `reviews.js`, `_worker.js` | `voice/ReviewsReader.kt`, `voice/Comparison.kt` | Website, no wrapper change |
| Compare by voice | `ai.js` (compare_products tool) | `voice/Comparison.kt` | Website, no wrapper change |
| Coupons | `coupons.js` | `voice/CouponFinder.kt` | Website, no wrapper change |
| Call the store by voice | `storecall.js`, `stores.js` | `voice/VoiceCommands.kt`, `data/StoreDirectory.kt` | Website, no wrapper change; wrapper opens tel: links |
| Price history | `pricehistory.js` | `data/SharedMemory.kt`, `ui/AppViewModel.kt` | Website, no wrapper change |
| Tell me about the store | `storeinfo.js`, `_worker.js` | `voice/StoreInfo.kt`, `data/StoreDirectory.kt` | Website, no wrapper change |
| Remember clothing sizes | `sizes.js` | `data/LocalStore.kt` | Website, no wrapper change |
| Return windows read aloud | `returns.js` | `data/StoreDirectory.kt` | Website, no wrapper change |
| Back-in-stock alerts | `watchlist.js`, `roundup.js` | `data/PriceCheckWorker.kt`, `ui/AppViewModel.kt` | Website, no wrapper change |
| Shared pure memory | `memory.js`, `_worker.js` | `data/SharedMemory.kt`, `data/SharedMemoryApi.kt` | Website, no wrapper change |
| Owner usage page | `usage.js`, `admin-page.js`, `pages/admin.html`, `_worker.js` | `ui/screens/OwnerScreen.kt`, `data/OwnerApi.kt`, `data/OwnerStats.kt` | Website — the owner page lives in the website's /admin |
| Report-a-mistake / teaching loop | `teaching.js`, `corrections.js`, `teaching-cases.json` | `data/SharedMemory.kt`, `voice/VoiceCommands.kt` | Website, no wrapper change |
| Delivery times read aloud | `app.js`, `checkout.js` | `voice/VoiceCommands.kt`, `data/StoreDirectory.kt` | Website, no wrapper change |

## Deliberately NOT built

- **Slippers rule** — still waiting for his yes/no.
- **Always-listening wake word** ("hey app" / "hey AIN Shop" while the app is closed) — not decided, not built.
- **$4.99 subscription** — built but switched off; the `/api/sub/*` routes answer `paywall_off`.

## Known drift

- **Shared pure memory paths.** The website uses `/api/shop/memory` and
  `/api/shop/memory/share`. Android calls `/api/memory/lookup` and
  `/api/memory/teach`, which the server does not have yet. Android treats
  the 404 as "no shared memory yet" and falls back to live search, so
  nothing breaks — but shared memory never switches on for Android until
  the paths are lined up. See `api-contract.json` (status `drift`).
