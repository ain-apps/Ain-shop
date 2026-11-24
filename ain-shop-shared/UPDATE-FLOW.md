# AIN Shop — how one update reaches all three platforms

Standing rule: every update updates iPhone, Android, and the website.
This page says exactly how, for each kind of change.

## The three receivers

| Platform | What it is | Where it lives |
|---|---|---|
| Website | The website + the server, served from Cloudflare | `ain-shop-shared/web/` (deployed from `ain-shop-deploy-own-account/`) |
| iPhone | Thin Swift shell (WKWebView) that opens the website | `ain-shop-ios-wrapper/` |
| Android | Full native app (Kotlin + Jetpack Compose) that calls the same backend API | `ain-shop-android-app/` |

## 1. A change to the shared web core (`ain-shop-shared/web/`)

This is most updates: a search fix, a new voice feature, a spoken line, a
page, a new API route in `_worker.js`.

- **Website:** deploy it. From `ain-shop-deploy-own-account/`, run
  `npx wrangler deploy` (needs his Cloudflare token, pasted fresh each
  time — the token is never saved). Then re-run the tests (see below).
- **iPhone:** nothing to rebuild. The wrapper opens the website, so the
  change is in the iPhone app the moment the deploy is live. Rebuild the
  wrapper only if its own Swift code changed.
- **Android:** check `features.json` for the feature. If the change is
  **server-only** (a route in `_worker.js`, the search matching, a price
  rule), Android gets it free — it calls the same backend. If the change
  is **a screen, a spoken line, or a new voice command**, change the
  matching Kotlin file listed in `features.json` too, then rebuild the
  app (`./gradlew assembleDebug` on a machine with the Android SDK).

## 2. A change to the API contract (`api-contract.json`)

1. Change the route in `web/_worker.js` AND in `api-contract.json`
   together — never one without the other.
2. Run `node tools/verify-shared.mjs` — it fails if the two disagree.
3. If Android calls the route, re-run
   `node tools/generate-android-api.mjs` and use the new constant in the
   Android API files. The generated file is `ApiEndpoints.kt`.
4. Deploy the website (step 1). Rebuild Android only if its code changed.

## 3. A change to the addresses (`config.json`)

1. Change `config.json` (site URL / API base URL).
2. Re-run `node tools/generate-android-api.mjs` — Android picks the new
   address up from the generated file.
3. Change the one line in `ain-shop-ios-wrapper/AINShop/WebView.swift`
   (`siteURL`) to the same address.
4. Deploy the website; rebuild both apps.

## 4. A change to the iPhone wrapper only

(Swift code: audio session, picture-in-picture, permissions, `tel:` handling.)

1. Edit the wrapper in `ain-shop-ios-wrapper/`.
2. The website and Android are untouched.
3. The wrapper still needs its first real build: his own Codemagic
   account + a fresh Apple signing key, and the live v1.0.0 bundle ID
   (the wrapper currently says `app.ain.shop` as a placeholder).

## 5. A change to the Android app only

(Kotlin screens, on-phone listening, PiP, notifications.)

1. Edit the Android project in `ain-shop-android-app/`.
2. The website and iPhone are untouched — unless the change also needs a
   server route, in which case see step 2.
3. The app has never been compiled here (no Android SDK). The first
   `./gradlew assembleDebug` is the real compile test.

## After every shared-layer change

```
cd ain-shop-shared
node tools/verify-shared.mjs
cd ../ain-shop-deploy-own-account/tests
node harness-509.mjs          # must stay 496/509
node test-v36-features.mjs    # must stay 75/75
```

Then deploy the website with his token, and rebuild the apps whose own
code changed. Nothing goes live, to the App Store, or to Google Play
without his say-so.
