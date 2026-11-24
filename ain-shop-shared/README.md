# AIN Shop — shared codebase

One shared layer feeds all three platforms — iPhone, Android, and the
website. That is the standing rule: every update updates all three.

## What lives where

```
ain-shop-shared/                  ← YOU ARE HERE — the shared layer
  web/                            ← the website + the server (the shared core)
    _worker.js                    Cloudflare Worker: the whole backend API
    app.js, ai.js, …              the website itself (voice, search, lists…)
    pages/                        index, admin, join, legal pages
    package.json                  {"type": "module"} — the web files are ESM
  config.json                     the addresses all three platforms use
  api-contract.json / .md         every API route, who calls it, live/off/drift
  features.json / .md             every feature, and where it lives per platform
  tools/                          scripts that keep the shared layer honest
  README.md                       this file
  UPDATE-FLOW.md                  how one update reaches each platform

ain-shop-deploy-own-account/      ← thin deploy shell for the website
  wrangler.toml                   points at ../ain-shop-shared/web (main + assets)
  DEPLOY-GUIDE.md                 how to deploy (needs his Cloudflare token)
  tests/                          509 search tests + v36 feature tests,
                                  run against the shared web core

ain-shop-android-app/             ← full native Android app (Kotlin + Compose)
  app/src/main/java/…/data/ApiEndpoints.kt   GENERATED from the shared
                                  contract — never edit by hand; run
                                  tools/generate-android-api.mjs

ain-shop-ios-wrapper/             ← thin iPhone shell (Swift + WKWebView)
  AINShop/WebView.swift           opens the website; the website IS the app
```

## How the three platforms share

- **The backend is shared by all three.** The worker (`web/_worker.js`)
  is the one server. The website calls it, the Android app calls it, and
  the iPhone wrapper loads the website, which calls it. A fix in the
  worker — the search matching, a new endpoint, a price rule — reaches
  all three the moment it is deployed. No app update needed.
- **The website is shared by iPhone and the website.** The iPhone wrapper
  is a thin shell that opens the website. A change to any file in `web/`
  reaches the iPhone app on the next deploy, with no wrapper rebuild —
  unless the wrapper's own Swift code changes (audio session, PiP,
  permissions).
- **Android shares the backend, not the web pages.** It is a full native
  app that re-implements the screens in Kotlin against the same API
  contract. A website-only change (a button, a spoken line) does NOT
  reach Android by itself — the matching Android screen has to be changed
  too, against the same contract. That is the one place "one update"
  means two code changes, and `features.json` says exactly which files
  on each side.
- **One contract, one config.** `api-contract.json` is the only list of
  API routes; `config.json` is the only place the site address lives.
  Android's endpoint constants are generated from them
  (`tools/generate-android-api.mjs`); the iPhone wrapper's address is the
  same value in `config.json` (one line in `WebView.swift`).

## The one known drift

Android calls `/api/memory/lookup` and `/api/memory/teach` for shared
memory. The server has `/api/shop/memory` and `/api/shop/memory/share`
instead. Android treats the 404 as "no shared memory yet" and falls back
to live search, so nothing breaks — but shared memory never switches on
for Android until the paths are lined up. See `api-contract.json`
(status `drift`) and `features.md`.

## Keeping it honest

Run this after any change to the shared layer:

```
node tools/verify-shared.mjs
```

It checks that the contract matches the worker, that the config matches
what Android and iOS use, that the generated Android file is up to date,
and that every path in `features.json` exists. It also re-runs nothing
live — no deploy, no keys, no tokens.

Tests live in `ain-shop-deploy-own-account/tests/` and run against the
shared web core:

```
cd ../ain-shop-deploy-own-account/tests
node harness-509.mjs          # must stay 496/509
node test-v36-features.mjs    # must stay 75/75
```

## What this folder is NOT

- It is not a live deploy. Deploying still needs his Cloudflare token,
  pasted fresh each time (see `../ain-shop-deploy-own-account/DEPLOY-GUIDE.md`).
- It is not the App Store app or Google Play. Nothing here submits or
  publishes anything.
- It does not hold secrets. No keys, tokens, PINs, or passwords belong
  here — the OpenAI key lives only in the site's D1 database.
