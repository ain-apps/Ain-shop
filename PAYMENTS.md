# AIN Shop payments (v8, Oct 26 2026) — BUILT, SWITCHED OFF

Model agreed with Nati (Oct 26 2026, 11:13 AM yes): shoppers pay $4.99/month after a 30-day free trial; stores join free (/join is never gated).
Nothing is charged or blocked today: `paywallOn` is 0 and no payment processor is connected.

## What exists
- Server (site/_worker.js, section "PAYMENTS / SUBSCRIPTION"):
  - DEFAULTS: `paywallOn 0`, `paywallSince 0`, `priceCents 499`, `priceCurrency 'USD'`, `trialDays 30`, `payProvider ''`, `stripePriceId`, `appStoreProductId`, `googlePlayProductId`, `subIpDay 300`, `trialsIpDay 5`.
  - D1 table `subs` (sid = SHA-256 of the phone's random id; created, status trial|active|canceled|expired, paid_until, provider, provider_ref, acct, test). Created only when the switch is ON (or the owner view reads it).
  - `subState(row, L, now, owner)` — the pure rule: OFF → free for all; ON → trial for trialDays from max(first seen, paywallSince), then blocked unless active/canceled with paid_until in the future; the logged-in owner is never blocked.
  - `gate()` on the paid features only: /api/ai/session, /api/shop/search, /api/shop/store, /api/shop/identify → 402 {error:"subscription_required"} after the trial. Details, checkout, barcode, /join, the visitor counter stay free. OFF → returns before any subscription read.
  - Routes: POST /api/sub/status | subscribe | cancel | restore (same-origin only, rate-capped); POST /api/pay/{stripe|appstore|googleplay}/webhook (501 until connected); setup-token route /api/admin/sub_set {device_id, status, paid_until, provider} for comps/tests.
  - `grantSub(env, sid, {...})` — THE one function that changes a subscription. Every processor ends there.
  - `PAY_PROVIDERS` — stripe / appstore / googleplay hooks, each `ready / checkout / cancel / restore / webhook`, all "not connected" today; the comment above it says exactly what each must do.
  - /api/status carries `paywall {on, price_cents, currency, trial_days}`; /api/owner/usage carries `subscriptions {...counts}` (shown in /admin under "Subscriptions").
- Phone (site/pay.js + #payDlg in pages/index.html): OFF → reads /api/status and stops (no button, no cookie, no storage). ON → random id in localStorage `bain:sub` + first-party cookie `ainshop_sub`; "Plan" button; the screen opens and speaks by itself when the trial is over or a paid feature answers 402; big Subscribe / Speak a command / Restore / Cancel / Close buttons; voice commands with the phone's speech recognition (payCmd* word lists in all 50 languages + English always).
- AI (ai.js): tools subscription_info / subscribe / cancel_subscription / restore_purchase + an instruction paragraph; OFF → it says AIN Shop is free right now.
- 25 new strings (pay*) in all 50 languages (i18n.js; machine-translated Oct 26 2026, not checked by native speakers).

## Turning it on (later, with Nati's word)
1. Connect a processor (below) and set `payProvider`.
2. POST /api/admin/config {"config":{"paywallOn":1,"paywallSince":<Date.now()>}} with the setup token — everyone already using the app gets the full 30 days from that moment.
3. Off again: {"config":{"paywallOn":0}} — instant, nothing is lost.

## Connecting Stripe (account in Nati's name)
Product "AIN Shop" monthly $4.99 → its price id into `stripePriceId`. Store the secret key and webhook secret in kv (`stripe_secret`, `stripe_whsec`) with setup-token routes like /api/admin/key (never in code). Fill `PAY_PROVIDERS.stripe`: ready() = both keys present; checkout() = Checkout Session mode=subscription, client_reference_id = sid, trial only if still in trial → {url}; webhook() = verify Stripe-Signature (HMAC-SHA256 "t.payload"), then grantSub on checkout.session.completed / invoice.paid / customer.subscription.updated|deleted; cancel() = cancel_at_period_end → grantSub status canceled. Webhook URL: https://ainshop.sites.tab.bot/api/pay/stripe/webhook. If Apple Pay on our own page is wanted, Permissions-Policy `payment=()` must become `payment=(self)` (Stripe Checkout itself is a redirect and does not need it).

## App Store / Google Play (native wrappers)
iOS: StoreKit 2 product `appStoreProductId`; the wrapper posts the signed transaction to /api/sub/restore {provider:"appstore", jws}; verify the JWS chain, grantSub; App Store Server Notifications V2 → /api/pay/appstore/webhook; cancel = iOS Settings (manage_url). Apple requires in-app purchase for digital subscriptions sold inside the iOS app.
Android: Play Billing `googlePlayProductId`; verify purchaseToken with the Play Developer API; RTDN → /api/pay/googleplay/webhook.
A person who pays on one platform keeps it on another through `acct` (Stripe customer / Apple originalTransactionId / Play purchaseToken) — the link step is not built yet.

## Known limits
- No accounts: a subscription is per phone/browser. Clearing the site's data gives a new trial (capped at trialsIpDay new trials per address per day). Restore must come from the processor.
- If the trial ends during a live conversation, the next search answers 402 and the AI gets an error; the wall shows at the next "tap to talk".
- Tests: test/pay.test.mjs (10), test/e2e_pay.py (43).
