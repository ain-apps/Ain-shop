# AIN Shop — iPhone wrapper (our own build, no Tab)

## What this is

A thin iPhone shell around the AIN Shop website. Open the app and the
website fills the whole screen: talk, search, hear prices, choose,
and the store's own page opens in Safari to buy. All the shopping,
voice, search and prices live in the website — this wrapper adds
nothing else. The website stays the source of truth, so the iPhone
app, the Android app and the website are always the same thing.

- Website: https://ain-shop.natimedwed.workers.dev (your own Cloudflare)
- Version: **1.0.1, build 102** — the next version after the live 1.0.0
- Needs iOS 15.0 or newer (same as the live app), iPhone only.
- Shared codebase: the website code lives in
  `../ain-shop-shared/web/` (see `../ain-shop-shared/README.md`). This
  wrapper opens that website, so every website update reaches the iPhone
  app on the next deploy — no wrapper rebuild needed. The site address
  is the shared `config.json` `site_url`; if it ever changes, change it
  there first, then the one `siteURL` line in `AINShop/WebView.swift`.

## ⚠️ First: check the bundle ID

The project uses the placeholder bundle ID **`app.ain.shop`**. Before
building, check the real one:

1. Open App Store Connect, open **AIN Shop**, open **App Information**.
2. Read the **Bundle ID** there.
3. If it is different from `app.ain.shop`, change it in two places:
   - `AINShop/AINShop.xcodeproj/project.pbxproj` — both
     `PRODUCT_BUNDLE_IDENTIFIER` lines
   - `codemagic.yaml` — the `BUNDLE_ID` line

Version 1.0.1 **must** use the same bundle ID as the live app, or
Apple treats it as a brand-new app instead of an update. Do not guess.

## What still needs you

1. **Bundle ID check** — above. Five minutes in App Store Connect.
2. **Your own Codemagic account** — sign up at codemagic.io (free
   tier), add this project from your GitHub (`ain-apps/ain-shop`,
   folder `ain-shop-ios-wrapper`).
3. **Apple signing** — in Codemagic, connect your Apple Developer
   account (the one that owns AIN Shop). Codemagic fetches the
   signing certificate and provisioning profile itself. Then, in
   App Store Connect, create an App Store Connect API key (Users and
   Access → Integrations → App Store Connect API) and put its three
   values in Codemagic as encrypted environment variables:
   `APP_STORE_CONNECT_PRIVATE_KEY` (the .p8 file contents),
   `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`.
   The old .p8 Tab gave you was deleted at your request, so a fresh
   key is needed — any new key works.
4. **TestFlight test** — the first build goes to TestFlight only.
   Install it on your iPhone, try a voice search yourself, and only
   then submit it to the App Store from App Store Connect.

## What does NOT need Tab

Nothing here needs Tab. The website code is yours, the Cloudflare
account is yours, the Apple Developer account is yours, and this
wrapper was built from your own website. No Tab account, file, key
or password is used anywhere in this project.

## How it works (the short version)

- `AINShopApp.swift` + `ContentView.swift` — the app opens one
  full-screen web view.
- `WebView.swift` — the rules: only our own site loads inside the
  app; store pages open in Safari (the site already marks them
  `target="_blank"` / `window.open(..., '_blank')`, and any other
  navigation out of the site is caught too); email links open in
  Mail; the microphone and camera are allowed only for our own site;
  audio may play without a tap so the voice can answer; if the web
  page crashes it reloads itself.
- `Info.plist` — plain-language microphone and camera permission
  text, portrait only (the site is portrait), version 1.0.1 / 102.
- `PrivacyInfo.xcprivacy` — declares no tracking and no data
  collected by the wrapper itself.
- No background audio mode: the site holds a Screen Wake Lock during
  a voice call, so the screen stays on while you talk. The app is
  foreground-only by design.
- No offline mode yet (same as the website — a known gap).

## Files

```
ain-shop-ios-wrapper/
├── codemagic.yaml                  # cloud build on Codemagic (your own account)
├── README.md                       # this file
└── AINShop/
    ├── AINShop.xcodeproj/
    │   └── project.pbxproj         # Xcode project (bundle ID placeholder inside)
    ├── AINShopApp.swift
    ├── ContentView.swift
    ├── WebView.swift               # the web view + its rules
    ├── Info.plist
    ├── PrivacyInfo.xcprivacy
    ├── LaunchScreen.storyboard
    └── Assets.xcassets/
        ├── AppIcon.appiconset/     # icon, made from the site's icon-512.png
        └── AccentColor.colorset/   # gold, same as the site
```

Note on the icon: the 1024-pixel App Store icon was made by scaling
up the site's 512-pixel icon, so it is a little soft. If the original
artwork turns up at 1024 pixels or bigger, replace `icon-1024.png`
with it for a sharper store listing.

## If you ever get a Mac

Open `AINShop/AINShop.xcodeproj` in Xcode, pick your team under
Signing & Capabilities, press Run on your iPhone. Same project,
same bundle ID rule.
