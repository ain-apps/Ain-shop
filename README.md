# AIN Shop (renamed from BAIN on Oct 26, 2026) – voice shopping assistant (demo)
Live: https://ainshop.sites.tab.bot/  ·  /join (stores)  ·  /admin (owner, PIN in work/owner_pin.txt)  ·  /terms  ·  /privacy
site/pages/*.html = the pages (index, admin, join, terms, privacy) — kept out of the site root on purpose: the host serves a root file before the Worker and ignores _headers, so the Worker serves /, /admin, /join, /terms, /privacy with the security headers (CSP, frame-ancestors none, HSTS, Permissions-Policy; /admin no-store + noindex).
site/_worker.js  server: realtime call (key server-side), product search, page reading, store mode, join + owner API, limits.
site/ai.js voice session + tools · site/app.js screen + store links · site/i18n.js interface strings in 50 languages (name/en/dir/speech + s; I.pick for first visit, I.code for names). Picker = #langBtn + <dialog id=langDlg> in index.html; voice = set_language / end_conversation tools in ai.js. Translations made Oct 26 2026 (pipeline + per-language JSON in tasks/0d480cc8…/tr). Pre-50-language backup: ../backup-pre-50lang
Tests: node --test test/unit.test.mjs test/i18n50.test.mjs · node test/dev_server.mjs 8790 /tmp/dev.db & python3 test/e2e_ui.py http://127.0.0.1:8790/ /tmp/s.png <PIN set via /api/admin/pin>
Live voice (costs cents): python3 test/live_voice.py <speech.wav> <out.json>  (SECS, LANG_UI env)

Rename: bain.sites.tab.bot and ishop.sites.tab.bot are redirect-only Workers (301 to ainshop, path kept, and they empty their old D1 on each request). Internal identifiers (BAIN_DB, BAIN_AI, bain:* localStorage, x-bain-* headers) were kept on purpose. Pre-rename backup: ../backup-bain-site

Security update Oct 26 2026 (ainshop-v5): atomic counters (incr = one SQL UPSERT…RETURNING), one D1 row per live call (live_calls) with minutes + money reserved at open and refunded at end, sweep on API requests, daily spending switch (dailyBudgetCents 2500 in DEFAULTS, change with /api/admin/config), PIN lockout per address/hour + site/day (/api/admin/unlock clears it), caps on store mode, /join, location lookups. Tests: node --test test/security.test.mjs. Pre-security backup: ../backup-pre-security

Voice checkout + camera + visitor counter, Oct 26 2026 (ainshop-v6): site/checkout.js (checkout panel, "my list" in localStorage bain:basket, camera) + ai.js tools checkout_prepare / checkout_go / checkout_help / list_add / list_read / list_remove / list_checkout / camera_open / camera_take / camera_close. Server: POST /api/shop/checkout (reads the store page + Shopify /products/<handle>.js; only public https, redirects checked by hand, robots.txt; details limits + daily switch) → Shopify /cart/<variant>:<qty>, WooCommerce simple /checkout/?add-to-cart=, BigCommerce /cart.php?action=add, else the product page; shipping/returns only quoted from schema.org or a page sentence, else null. POST /api/shop/identify (photo ≤3 MB, ipIdentifyDay 30, identifyReserveCents, not stored). POST /api/hit + visitors in /api/owner/usage and /admin (hash of a random device id, test runs apart). Card details are never handled: the handoff explains Apple Pay / iPhone "Scan Credit Card". Tests: node --test test/checkout.test.mjs · python3 test/e2e_checkout.py http://127.0.0.1:8790/ (dev server). Pre-v6 backup: ../backup-pre-checkout

Payments screen, Oct 26 2026 (ainshop-v8) — BUILT BUT OFF (DEFAULTS.paywallOn 0: nobody charged or blocked, nothing stored): $4.99/month after a 30-day trial per phone, stores free. site/pay.js + #payDlg, ai.js tools subscription_info / subscribe / cancel_subscription / restore_purchase, worker section "PAYMENTS / SUBSCRIPTION" (subState, gate on ai/session + shop/search|store|identify, /api/sub/*, /api/pay/*/webhook, grantSub, PAY_PROVIDERS hooks), /admin "Subscriptions". Full notes + how to connect Stripe / App Store / Google Play: ../PAYMENTS.md. Tests: node --test test/pay.test.mjs · python3 test/e2e_pay.py <url> <dev db> work/setup_token.txt <PIN>. Pre-v8 backup: ../backup-pre-paywall


## v9 (Oct 26, 2026) — screen stays awake during a conversation
ai.js `awakeOn()` in start() (inside the tap), `awakeOff()` in teardown(); Screen Wake Lock, re-taken on visibilitychange→visible; without Wake Lock a muted looping inline 64px video with no audio track (site/keepawake.mp4, fetched as blob:) plays instead. `window.BAIN_AWAKE.state()` for tests. Test: test/e2e_awake.py (dev_server). Backup of v8: project/backup-ainshop-v8. Real-iPhone behaviour not verified.

## v10 (Oct 26, 2026) — App Store / Google Play legal pages
/privacy, /terms, /contact (English + Hebrew; other languages English + legalNote). GENERATED: edit legal/build_legal.py (OWNER block = the one place for owner/business name, email, place, price) then `python3 legal/build_legal.py` — do not hand-edit site/pages/{privacy,terms,contact}.html. Retention: _worker.js RETAIN_DAYS=365 prunes ai_log + visits (once/day per isolate, from sweep) — keep in sync with RETAIN in build_legal.py. Links: notice, footer (section.notes), language dialog (.legalLinks). New i18n key contactLink (50 langs). sw cache ainshop-v10. Test: python3 test/e2e_legal.py <url>. Backup of v9: ../backup-ainshop-v9. Not legal advice.

## v11 (Oct 27, 2026) — fix round from the professional review (ain_professional_review_oct26.md)
- Typing never turns the microphone on: with no voice call, the type box runs a plain search (site/textkit.js parseTyped reads "under 500", "over 400", "at Walmart") and focus moves to the results heading; during a call the typed words join the call as before. The Send button is no longer swallowed by "tap to interrupt".
- Product cards: short spoken-friendly names (search model returns short_name → normProduct.short; textkit.js shortName checks it names the same product, else shortens the store title heuristically), store photo large on top with alt text = the short name (+ the photo description once known), no grey empty boxes; the AI gets short_name and reads it.
- No stale lines: the "still checking" nudge is spoken only (not left in #said), BAIN_AI.resultsIn() clears it and any "Connecting…" when results land; the announce region is cleared when the call opens.
- Skip link: hidden until there are results, then "Results for “…”" (localized, direction-isolated).
- Buttons: "Checkout help" is the same size as Scan barcode / Camera and really hidden until a checkout ([hidden] now wins over button display); SVG icons (CSS mask, currentColor) for barcode / camera / checkout help; all footer/notice/legal links ≥44 px; join-page brand link contrast fixed; legal pages' two navs have unique names (axe landmark-unique).
- Voice: speech-recognition language hint = the screen language (ai.js sttHint, its own session.update so a refusal costs nothing; moves with set_language / the picker); language pinning in textkit.js langOf (Portuguese no longer read as Spanish; Italian, Dutch, Polish, Swedish, Turkish, Indonesian added; ties go to the screen language; Unicode-safe word matching). pagehide ends the call (beacon to /api/ai/end). Daily limit / busy: spoken + on screen with "You can still type…" (new i18n key typeInstead, 50 languages). Per-address cap unchanged (ipSessionsDay 20).
- http:// → https:// redirect script at the top of every page (localhost/127.x exempt for tests). sw cache ainshop-v11 (+textkit.js).
- Tests: test/v11.test.mjs (node), test/e2e_v11.py <dev url> [axe.min.js] (51 checks incl. axe 0 on home/results/Hebrew/legal/join). Stale v9 regexes in 4 tests and the privacy phrase in e2e_ui.py updated. Backup of v10: ../backup-ainshop-v10.


## v12 (Oct 27, 2026) — shopping only
Nati: "limited just for shopping, comparing, but nothing else". `_worker.js` SCOPE_RULE is in the session the server opens (sessionInstructions), in ai.js instructions (identical text, test/scope.test.mjs), and every turn's system note. Server: /api/shop/search refuses clearly off-topic queries (offTopicQuery) with 422 off_topic before cache/limits/spend, and search prompts return off_topic; store mode refuses off-topic queries and non-store sites (looksLikeShop → not_a_store). i18n key offTopic in all 50 languages. Live check: weather/joke/president refused; reading glasses + compare normal. Backup: backup-ainshop-v11.

- v13 (Oct 27, 2026, ainshop-v13): "Buy again" — site/history.js (BAIN_HIST): the phone remembers items the person PICKED (Buy tap/voice, store link, checkout, list add) in localStorage "bain:history" (max 50, newest first, same item within 30 min = one pick; no server copy; honest wording "you picked", not receipts). Home-screen "Buy again" list (#histSec, big buttons, Forget, Clear my history with confirm), typed commands (histCmdShow/histCmdClear/histCmdForget in all 50 languages + English), Buy again = fresh price check via BAIN_CO.prepare(..., {quiet:true}) with same/changed/unavailable said. AI: history names/stores (last 20) in instructions; tools get_purchase_history, reorder_item, forget_purchase. Corrections email (Nati 11:12 PM): site/corrections.js (BAIN_CORR) ainshop.corrections@mail.tab.bot (NOT ain.corrections — that is the Torah app's), line on home + language dialog + /contact (48 other languages via i18n), typed/voice "report a mistake" → mailto subject "AIN Shop correction" with search/product in body, tool report_mistake, AI corrections line at the end of its FIRST answer per call only until Nov 17 2026 (BAIN_CORR.AI_LINE_UNTIL). Privacy page EN+HE updated. Tests: test/v13.test.mjs, test/e2e_v13.py <dev url> [axe]. Backup of v12: backup-ainshop-v12.


## ainshop-v16 (Oct 27, 2026 ~9:10 PM ET) — public mailing address (virtual mailbox)
Legal pages privacy/terms/contact (en + he): "Detroit" -> "Oak Park, Michigan, USA" + line "Mailing address: Nesanel S Myedvied, 21700 Greenfield Rd, Ste 121 Unit #2118, Oak Park, MI 48237, USA" (Hebrew label, Latin address).
Edited by hand in site/pages/*.html (legal/build_legal.py OWNER updated but the generator is behind the live pages — don't regenerate blindly).
sw.js V = ainshop-v16; test/v15 sw check widened to v15+. Unit 154/154. Backup: backup-ainshop-v15.


## ainshop-v17 (Oct 27, 2026 ~9:15 PM ET) — Nati's name hidden (he asked 9:12 PM)
Legal pages EN+HE: mailing address line is now just "21700 Greenfield Rd, Ste 121 Unit #2118, Oak Park, MI 48237, USA"; the developer is "an individual developer in Oak Park" / "AIN Shop" (no "Nati Medwed"/"נתי מדבד"). v18 also replaced the contact email natimedwed@gmail.com with ainshop.corrections@mail.tab.bot on privacy/terms/contact (root's instruction). legal/build_legal.py OWNER updated (name empty — the generator does not handle an empty name; pages are hand-edited, don't regenerate). Backup: backup-ainshop-v16.

## ainshop-v18 (Oct 28, 2026) — several stores at once (Nati Oct 27, 9:02 PM)
site/stores.js (BAIN_STORES): each store the person goes to is a "place" with its own last search, results (≤40 kept), chosen item; "All stores" (key *) is the normal cross-store search. localStorage "bain:stores" {active, prev, places, order}, max 8 stores. Carts = the existing list (bain:basket) grouped by store (checkout.js groups) — checkout links are untouched (affiliate tracking unchanged); the list section now shows one cart per store with "Store: items: N, total: $X." + its own checkout button, and "All together" when several.
Hooks in app.js: search() → BAIN_STORES.scope(args) (at a store a search without stores stays in that store; one named store moves there; several = all stores) and landed(); storeOpen → beforeStore/storeLanded/storeFailed (a store read from its site is a place; typed searches there go through storeOpen); typed commands (storeCmdGo/Back/All, cartsCmd in 50 langs + English; go-phrase must start/end the sentence). Big buttons in #storesSec (aria-pressed = current store), "Back to X", "All my carts (N)" (speaks totals), "Close X".
AI: storesRule() in instructions; tools store_switch / store_back / stores_list / store_close / carts_read; list_checkout defaults to the active store's cart. New i18n keys (25) in all 50 languages (translated Oct 28, files in tasks/49994b13…/tr). sw V ainshop-v18 (+stores.js), then ainshop-v18.1 (shorter spoken lines after a store switch). Live voice check Oct 28 (1 call): "Go to Walmart" → store_switch, "go back to the other store" → store_back, "read all my carts" → carts_read, all correct.
Tests: node --test test/v18.test.mjs (also in the full unit run) · python3 test/e2e_v18.py <url> [axe] (38 checks, mocks /api/shop/search; works on live too). Backup of v17: backup-ainshop-v17.


## ainshop-v19 (Oct 28, 2026) — quicker answers + forgiving understanding (Nati Oct 27, 9:42 PM)
- Answer starts at end of speech: ai.js answers the moment the voice detector closes the turn (`earlyTurn`, response metadata {early, item}). Before this, it waited for the written words (about 1.2 s). The written words still arrive and are added as a system note right after the user's audio (`previous_item_id`), which pins the language for later turns ("the voice decides the language"). An early answer needs at least 450 ms of speech, and the AI must not be talking unless duplex is 'full' (headphones / echo-cancelled) with at least 700 ms of speech.
- No action on noise: tools that an early answer calls are HELD until the words are known (`tools:held-for-words`). Noise means empty text, a symbol, or stock phrases speech-to-text makes up from silence ("Thank you.", "you", "Subtitles by…", "תודה", …; see intent.js `noise`). On noise the answer is cancelled, `output_audio_buffer.clear` is sent, held tools get `not_done`, and the audio item is deleted. A failed or late transcript on less than 900 ms of speech does nothing; on longer speech, the AI may act only if it clearly understood, otherwise it asks once to repeat. An echo barge-in drops its early answer too.
- Turn detection is semantic_vad with eagerness high (it was medium). Transcription prompt `STT_PROMPT` lists shopping words and store names ("carts", not "cards").
- "Searching…" right away: if a search, compare, open_store or reorder call came with no words spoken first, `cueIfSilent` says i18n `searching` immediately (outside the conversation, no tools). The 9 s "still checking" nudge is unchanged. SEARCH rule: always say 3–6 words before searching.
- Quick actions are not said twice: the AI says the confirmation BEFORE store_switch (new store, empty cart) / store_close / list_remove. When that worked, no second answer is made (`quick:confirmed-already`).
- UNDERSTAND_RULE in instructions: be forgiving (mishearings, cut-off words, Hebrew/English/Yiddish mixes); after acting, confirm what was done, naming item and store ("Added milk to your Walmart cart."); if unsure and the action would change something, ask ONE short yes/no question; on noise, no tool.
- site/intent.js (BAIN_INTENT): `normalize` removes accents, Hebrew points, Yiddish marks and ligatures. `fix` handles context-only mishearings ("my cards"→carts, "wall mart"→walmart, "add to card"→cart; "gift cards" is untouched). `hit` is a forgiving phrase match (one letter off, cut-off words, filler words; needs 2+ words and a short sentence, so "black shoes" ≠ "back"). `lead` matches "swich to walmart". stores.js and history.js typed commands use it, and their phrase lists now always include English + Hebrew + Yiddish beside the screen language.
- index.html carries two impact-site-verification meta tags (affiliate worker, Oct 28). KEEP BOTH in every version. A hotfix (v18.1 + first tag) went out before v19.
- Latency (end of speech → first AI audio, level meters on the mic and AI streams; test/live_latency.py <wav> <sched.json> <out.json>, SECS env; probe WAVs + results in tasks/dca71cf9…/lat/): v18.1 "Go to Walmart" 7.2 s (over the greeting's tail) / "Find me a talking watch" 2.9 s / "Read all my carts" 3.7 s → v19 2.5 / 1.75 / 2.2 s. A 0.35 s beep in a quiet moment: no reaction.
- Tests: node --test test/v19.test.mjs (13). Full unit run 175/175. Stale regexes in v11/v13/v18 tests widened. Backup of v18.1: backup-ainshop-v18.1. Hotfix folder: hotfix-v18.1-impact.


## v20 (Oct 28, 2026) — background noise + the spoken "what can you do" tour and common questions
Backup of v19: ../backup-ainshop-v19. Tests: node --test test/*.test.mjs (v20.test.mjs = gate on real recordings + call logic + tour);
browser: python3 test/e2e_v20_noise.py <base> <wav> <seconds> <out.json> (the gate in real Chromium with Chrome's own noise suppression,
a real recording as the microphone); live (costs cents, max 3 calls per round, never retried): python3 test/live_noise.py <wav> <out.json>.
Noise clips: test/fixtures/noise/ (real Wikimedia Commons recordings, licences in LICENSES.txt).
- site/noisegate.js (BAIN_GATE): listens to the call's own microphone stream through an AnalyserNode (it never changes what is sent).
  Every 20 ms: speech-band level, a room floor that follows the quietest moments (rises 1.5 dB/s; digital silence never pulls it down),
  and voicing (band-limited autocorrelation, pitch 75–400 Hz). For each stretch the voice detector closes: "noise" (under 120 ms of
  vowel sound, e.g. cough, door, fan, passing cars), "far" (voiced but < 15 dB above the room), "voice", or "unknown" (no gate → v19).
  The AudioContext is made inside the tap (BAIN_GATE.prime) for iPhone.
- ai.js: mic constraints + voiceIsolation; gateJudge() at input_audio_buffer.committed; canEarly() refuses noise/far; gateDrop() drops a
  word or two on a noise stretch (never right after the AI asked a yes/no question), and far voices under the AI while it keeps talking;
  far/noise stretches with real words go to the AI with BG_NOTE (answer only if said to you, else call ignore_sound; confirm changes
  with one yes/no). New tool ignore_sound (no output, no action). While the gate runs, turn detection has interrupt_response:false and
  stopForVoice() stops the AI only for >=200 ms of nearby voice (a cough/car/TV no longer cuts it off); without the gate the server
  interrupts as before and a stretch dropped as noise makes the AI continue where it stopped (resumeAfterNoise). The server session
  keeps noise_reduction far_field and semantic_vad eagerness high (v19 speed kept).
  LIVE FINDING (Oct 28 call): even with interrupt_response:false the realtime server still cleared the AI's audio the moment its
  voice detector heard a cough (output_audio_buffer.cleared at speech_started). So the real protection is: the cut is marked
  (barge.cut), and when the stretch is then dropped as noise the AI says only the rest of its answer (no "picking up" talk).
- promptEcho(): on noise, speech-to-text wrote back its own hint ("A person shopping by voice in AIN Shop…", "Add to my list,
  Walmart, Target, Amazon, Best Buy") — seen live on v19 with a cough, a sneeze and a crowd. Such transcripts are dropped (a short
  piece of the hint only when the gate did not hear a clear nearby voice, so "go to Walmart" still works).
- isEchoOf(): 3+ words must also follow the AI's own word order (live: "add milk to my Walmart cart" said while the AI read Walmart
  milk results was taken for the AI's echo in v19 logic and lost). Early answers need >= 400 ms of vowel sound (a vocal sneeze ~350).
- intent.js STOCK: sound words (achoo, cough, sneeze, ahem, bless you…) on a short sound are noise.
- app_tour tool: "what can you do / tell me about the app / options / which stores do you shop at" → 10 short feature lines with the
  words to say, ending "Say a feature to hear more."; "help / common questions / questions" → topic questions: 7 common questions
  (search, check out & pay, card safety, which stores, it doesn't hear me, cost → subscription_info, talk to a person → the corrections
  email). The greeting now ends with "you can say 'what can you do' anytime". "Which stores am I in?" stays stores_list.
- Known limits: a TV or a crowd close to the phone sounds like a near voice to the gate (Chrome's noise suppression lifts it); those
  rely on the transcript checks and the AI's ignore_sound judgement. A vocal sneeze ("achoo") is voiced; its transcript decides.

v20 LIVE RESULTS (Oct 28, live site, fake mic in Chromium, 3 live calls total)
- v19 baseline: cough -> STT invented "Add to my list" + AI "sorry I didn't catch that"; sneeze -> AI spoke twice; TV -> shopping refusal;
  cough_x3/door/traffic/cars/fan/chatter ignored; commands understood under cough/traffic/chatter/TV, quiet older voice understood.
- v20 call 2: cough/cough_x3/door/traffic/cars/fan/chatter ignored (cough's fake STT text dropped); sneeze still started an early answer;
  TV still got the refusal; a cough cut the AI and the resume said "let me pick up from there"; all commands understood
  (cmd+cough was lost to the old echo check). Fixed after: echo needs word order, early answers need >=400 ms voicing,
  TV -> ignore_sound, resume says only the rest.
- v20 call 3 (after fixes): TV -> ignore_sound, silent; sneeze -> both fake transcripts dropped, silent; cough while AI talked -> dropped;
  cmd+cough -> searched Walmart milk; quiet older voice with a far TV -> understood. One bug found and fixed after the call
  (the AI's own early answer was being stopped by its own turn when its audio started before the words) — verified by
  replaying the live event order in test/v20.test.mjs, not by a 4th live call.


## v21 (Oct 28, 2026) — fixes from the two-reviewer audit (/home/user/tab/files/ainshop_review_oct28.md)
- No inline scripts on any page: http→https + frame guard in site/boot.js (first in <head>), page code in home.js, admin-page.js, join-page.js, terms-page.js, privacy-page.js, contact-page.js, legal-common.js. CSP script-src is now 'self' 'wasm-unsafe-eval' (no 'unsafe-inline'). HSTS adds includeSubDomains. connect-src stays https: on purpose (checkout.js reads store pages / Shopify cart from the phone).
- e2e tests run axe with pg.evaluate() (add_script_tag is an inline script and is now refused by the CSP — that is the CSP working).
- Results: sold-out items and items in another colour than asked go lower (_worker.js fitScore/colorMismatch, exported, tested); products carry color_differs; the voice says "out of stock" / "not the colour you asked for" and never calls an item available when stock is unknown; one spoken commission sentence per conversation before the first hand-off.
- Home: voice notice line before the first tap (noticeVoice), commission line inside the results (#resAff), store links say they open a new tab (aria-describedby #newTabNote), daily-limit line, product photos decorative (alt=""), Buy button label "Buy at <store>: <short name>", results scroll into view (focus not moved), Hebrew header kept on one line.
- Legal pages: language button's spoken name starts with its visible word (axe label-content-name-mismatch fixed); 48 other languages get a translated short version above the English text; Contact page has "Delete AIN Shop data on this phone" (asks first, clears local storage, caches, service worker); privacy wording made exact (outside analytics vs our own visit count, Buy-again/ZIP shared with the AI during a chat, product photos load from store image servers, a rights section, 16 where local law says so). 22 new i18n keys × 50 languages.
- legal/build_legal.py is marked DO NOT RUN (out of date since v16; pages are hand-edited).
- Tests: 209 unit (7 new in test/v21.test.mjs) pass; e2e: ui 59, legal 66, v11 52, v13 46, v14 70, v18 38, checkout 42, awake all pass. Known and unchanged from v20: e2e_ui admin "lists store" step and e2e_barcode time out the same way on v20.
- Backup of v20: backup-ainshop-v20/site.


## v22 (Oct 30–31, 2026) — track my delivery, return an item, A–Z languages, translated camera/barcode buttons, static fix, Shop tip
Backup of v21: ../backup-ainshop-v21/site. Tests: node --test test/*.test.mjs (v22.test.mjs new) · python3 test/e2e_v22.py <dev url> <out dir> (390x844 + 375x667).
- site/orders.js (BAIN_ORDERS): "Track my delivery" / "Return an item" buttons (#ordTrack/#ordReturn, panel #ordSec) + voice tool order_help {kind track|return, store?, item?}
  (ai.js: DELIVERY AND RETURNS rule, EVERYTHING BY VOICE line, app_tour line) + typed words (i18n ordCmdTrack / ordCmdReturn, checked FIRST in the type box,
  store names found anywhere in the words, also glued to a prefix; Chinese/Japanese compared without spaces). AIN Shop holds no orders and says so (ordNote):
  it opens the STORE's own order / returns page, per store from the Buy-again history (newest first) or a store the person names. PAGES = 18 known stores,
  pages checked Oct 30 (curl / search; amazon/ebay/chewy redirect to sign-in = exists); unknown store → its home page + "look for Order status / Returns".
  From voice the page opens in after(); if the phone blocks it, the next tap anywhere opens it (like open_product). A button tap during a call only shows
  the panel and tells the AI (no double open).
- Camera / barcode buttons stayed English after a language change (Hebrew report): applyLang() now always re-renders BAIN_CO, BAIN_BC, BAIN_ORDERS and the
  buttons carry data-i18n. The misplaced "?" was the English text in an RTL page; the Hebrew text ends right.
- Language list: app.js langOrder() = Intl.Collator('en') by the name shown (Latin A–Z, then other alphabets).
- STATIC (Nati: "this app has static noise in the background"): the v20 noise gate ran an AudioContext (own sample rate) next to the WebRTC call — the same
  cause as the Torah app's hr-v27 iPhone static. noisegate.js allowed(): OFF on iPhone/iPad (no context made at all; v19 behaviour + transcript checks +
  ignore_sound), ON elsewhere; localStorage bain:gate=on/off overrides. stop() also closes a primed context. barcode.js beeps: the context is suspended
  1.5 s after the last beep (was left running forever after a scan). The keep-awake video has no sound track (unchanged). Real-iPhone hearing not verifiable headless.
- Shop tip: #shopTip in the notes: https://sovrn.co/1en0ohy (redirects to walmart.com) — "Shop tip: Walmart, an example store (sponsored link)",
  rel="sponsored noopener noreferrer", aria-label via data-i18n-label shopTipLabel (mentions the commission). Not a partner claim.
- 19 new i18n keys × 50 languages (translations Oct 30; strings in tasks/bc272750…/v22_strings.json; typed-command examples per language in
  test/fixtures/v22_examples.json and tested). sw cache ainshop-v22 (+ orders.js in the shell).


## v23 (Nov 1, 2026) — "Delete AIN Shop data on this phone" in Settings + by voice (Nati, Oct 31: "I tried to delete my account… in my settings")
Backup of v22: ../backup-ainshop-v22/site. Tests: node --test test/*.test.mjs (v23.test.mjs new) · python3 test/e2e_v23.py <dev url> <out dir> (WebKit, 390x844 + 375x667).
- AIN Shop has NO account. The one erase action is "Delete AIN Shop data on this phone" (clearBtn). It is now also in a "Settings" part at the top of the 🌐 dialog
  (#setSec / #setClear in pages/index.html; app.js setTexts()). The dialog now opens scrolled to the top (focus still on the current language, preventScroll) so the button is in sight.
- ONE big yes/no box for every way in (legal-common.js AIN_LEGAL.ask, now also loaded on the home page): <dialog id=clearDlg role=alertdialog>, question = clearAsk,
  88 px buttons "Yes, delete everything" / "No, keep my data" (Escape/back = No). Yes → clearAll() (local + session storage, caches, service worker; unchanged) → the box,
  the status line and the phone's voice say clearDoneAll ("AIN Shop keeps no account… everything erased"); OK reloads the home screen fresh (Contact page: just closes).
  No → "Nothing was deleted." The Contact page buttons use the same box (was the phone's small window.confirm()). A voice call is ended first when Yes is tapped.
- Voice/typed words (clearCmd, whole phrases, screen language + English + Hebrew): "delete my data", "delete my account", "erase my data", "close my account",
  "מחק את הנתונים שלי", "מחק את החשבון"… → the box only, never a delete. In a call: the heard words open the box at once (ai.js transcription event) and the AI has
  tool delete_my_data (opens the same box; rule "DELETE MY DATA / MY ACCOUNT" says it must never claim it deleted anything). Taps inside #clearDlg are not swallowed by tap-to-interrupt.
- New i18n keys, English + Hebrew only: setH, clearNoAcct, clearYes, clearNo, clearOkBtn, clearKept, clearDoneAll, clearCmd. Other languages never see English there:
  the heading and the no-account line are hidden, Yes = their clearBtn, No/OK = their langClose, done = their clearDone (test/i18n50.test.mjs lists these keys as EN_HE_ONLY).
- sw cache ainshop-v23 (+ legal-common.js in the shell). Test edits: v21 (box instead of confirm), v11 (typed-command chain may include AIN_LEGAL), v22 (sw v22+).
- Not verified on a real iPhone: VoiceOver reading the box, the phone voice speaking the done line, the reload after OK in the Home-Screen app.


## v24 (Nov 1, 2026) — quicker response (Nati, Oct 31 11:58 PM + Nov 1 12:01 AM: "the apps respond quicker to commands"; chose all 3 options)
Backup of v23: ../backup-ainshop-v23/site (+ test). Tests: node --test test/*.test.mjs (v24.test.mjs new) · python3 test/e2e_v24.py <dev url> <out dir> (WebKit, 390x844 + 375x667).
- Splash (home.js): hidden the moment the page is ready (DOMContentLoaded), fade 0.15 s; the old fixed 1.6 s stays only as a safety net. Measured in WebKit
  (dev server, 5 opens): gone at 2.31–2.38 s before → 0.38–0.53 s after.
- Voice call: the guarded turn detection (iPhone speaker while the AI talks: server_vad) waits 450 ms of silence (was 600). Normal turns stay semantic_vad 'high'.
- Soft cue (ai.js cue()/cueFor()): a quiet two-note tick (660→990 Hz, 2×45 ms, amplitude 0.12 = half the interrupt blip) the moment a turn is taken
  (early answer starts at input_audio_buffer.committed, or the words arrive) and when a short command is done; once per turn. A plain <audio> blob WAV like blip
  (primed silently in the tap), NO AudioContext (v22 static rule). localStorage bain:cue=off turns it off. Not on speech_started (that fires on noise and mid-sentence).
- Short commands on the phone (intent.js BAIN_INTENT.quick(): whole utterance only, filler allowed, English + Hebrew + a little Yiddish):
  stop/pause/quiet/shh/hold on/עצור/תפסיק/די/שקט/רגע… → while the AI talks, is answering, or finished < 2.5 s before the words began: silence at once
  (response.cancel + output_audio_buffer.clear), a system note tells the AI to stay quiet, NO new answer, the call stays on. Said with nothing playing,
  "stop" still goes to the AI (goodbye + end_conversation, as before). The stop words also act on interim words
  (conversation.item.input_audio_transcription.delta) while the AI talks.
  next/more/הבא/עוד → the next 3 results are taken on the phone and handed to the AI to read (no more_results tool round trip).
  back/previous/הקודם/חזור → the 3 before, only when more than 3 were shown and no other store is open (else the AI decides; "go back" can mean a store).
  The quick branch runs after the noise / echo / prompt-echo / background checks. The tour's "stop" line says this.
- sw cache ainshop-v24. Test edit: v23.test.mjs (sw v23+).
- Not verified on a real iPhone: hearing the cue (volume, whether the echo canceller removes it from the mic), real end-of-speech timing, the transcriber's
  interim words for one-word commands.

## v25 (Nov 1, 2026) — "Response speed" setting (Nati, Nov 1 12:01 AM; arrived after v24 was published)
v24 went live first (publish version 16). Tests: node --test test/*.test.mjs (v25.test.mjs new) · python3 test/e2e_v25.py <dev url> <out dir> (WebKit, 390x844 + 375x667, en + he).
- Settings part of the 🌐 dialog: "Response speed" with 3 big buttons (#speedSec, data-speed fast|normal|slow, aria-pressed, ✓ + filled on the chosen one), under the delete button
  (which stays in sight on open). Stored on the phone: localStorage bain:speed (Normal = key removed). Announced: speedSet. Keys speedH/speedFast/speedNormal/speedSlow/
  speedHint/speedSet: English + Hebrew only (i18n50 EN_HE_ONLY); other languages show the English words (the group gets lang="en").
- ai.js setVAD(): Normal = v24 (semantic_vad 'high'; 450 ms server_vad while the AI talks on the iPhone speaker). Fast = server_vad 300 ms, Slow = server_vad 800 ms in
  every turn (threshold 0.6 / prefix 400 normally, 0.8 / 500 while the AI talks). A change applies at once in a running call (BAIN_AI.speedChanged → setVAD(true)).
  The short-command path (stop / next / back) does not read it.
- sw cache ainshop-v25. Test edits: v24.test.mjs (v24+, SPEED_MS), i18n50.test.mjs (EN_HE_ONLY).
- Pre-existing failures, the same on the v23 backup: e2e_ui "admin lists store", e2e_pay 2 admin checks, e2e_barcode wait_for_function timeout.

## v26 (Nov 1, 2026) — one tap on "Tap here to end" ends the call (real iPhone, BrowserStack iOS 27 Safari: the first tap only interrupted the AI)
Backup of v25: ../backup-ainshop-v25 (site + test). Tests: node --test test/*.test.mjs (v26.test.mjs new) · python3 test/e2e_v26.py <dev url> <out dir> (WebKit, 390x844 + 375x667).
- Cause: the capture tap-to-interrupt (ai.js onTap, pointerdown) also caught the talk/end button while the AI talked: it interrupted and swallowed the click,
  and toggle() itself had "interrupt first, end on the next tap". So ending took two taps whenever the AI was speaking.
- Now: onTap handles #talk before tap-to-interrupt. The press (pointerdown) on the button in a live call ends it at once (stop('user') → teardown: AI voice
  paused + srcObject cleared, response stream/mic tracks/connection closed, "Conversation ended." on screen + announced). Only the click that lands right as
  that same press lifts (pointerup < 800 ms before) is swallowed, so it cannot start a new call; pointercancel clears it. A click with no press (VoiceOver,
  keyboard) reaches toggle(), which now always ends a live call (the interrupt-only branch is gone). teardown also pauses the AI audio element.
- Tap anywhere else still only interrupts (unchanged); speed setting, quick commands, Impact tags, Sovrn link untouched.
- sw cache ainshop-v26. Test edit: v25.test.mjs (sw v25+).
- Not verified on a real iPhone yet: the one-tap end on iOS 27 Safari / Home-Screen app with VoiceOver on.
- Published Nov 1 2026 04:25 UTC (publish version 18); live sw.js reads ainshop-v26. e2e_v26 also run against the live site.

## v27 (Nov 1, 2026) — Response speed by voice (Nati, Nov 1 12:23 AM: "yes, make these by voice also"; the steer arrived after v26 was published)
Tests: node --test test/*.test.mjs (v27.test.mjs new) · python3 test/e2e_v27.py <dev url> <out dir> (WebKit, 390x844 + 375x667, en + he).
- intent.js BAIN_INTENT.speed(text, strict) → fast | normal | slow | ask | null, whole utterance only (+ QFILL filler): "faster", "talk/respond faster", "quicker",
  "speed up", "מהר יותר" → fast; "normal speed", "מהירות רגילה" → normal; "slower", "wait longer", "slow down", "give me more time", "לאט יותר", "חכה יותר" → slow;
  "what's my speed?", "מה המהירות שלי" → ask. Bare "normal"/"רגיל" only when typed outside a call (strict in a call: it's a common answer to the AI).
  "fast shipping", "slow cooker", "משלוח מהיר"… never match.
- In a call (ai.js speedTurn, before quickTurn): APP().speedCmd → setSpeed (saved in bain:speed, status + announce, speedChanged → setVAD at once), the old
  answer/early answer is hushed (quickHush), and the AI is told to say only speedSet ("Response speed: Fast." / "מהירות תגובה: מהיר.") in the voice's language.
- Typed outside a call (app.js speedTyped, first in the typed chain): same setting, the phone's own voice says it (sayNative), no search. No new i18n keys.
- sw cache ainshop-v27. Test edits: v11.test.mjs (typed chain may include speedTyped), v26.test.mjs (sw v26+).
- v26 published 04:25 UTC (publish version 18), v27 published ~04:31 UTC (publish version 19); live sw.js reads ainshop-v27; e2e_v26 + e2e_v27 pass against live.

## v28 (Nov 1, 2026) — a FULLY VOICE app (Nati, Nov 1 12:23 AM: "I want every command that we have any button for to have an option by voice, to be a fully voice app"; 12:25 AM: "not only in Hebrew and English")
Tests: node --test test/*.test.mjs (v28.test.mjs new) · python3 test/e2e_v28.py <dev url> <out dir> [langs] (WebKit 390x844: every audited command by simulated voice AND typed, en/he/yi every command + all phrasings, plus fr, es, ru, ar, de, zh-CN, am, hi, uk).
Backup of v27: project/backup-ainshop-v27. Also from the real-iPhone check (root steer): a big **Settings** button on the main screen (#setBtn, opens the 🌐 dialog at Settings) and the Return panel's example is now a return ("return an item to Walmart", new key ordNoneReturn, all 50).
- **vcmd-i18n.js** (new, part of the i18n system): per language `BAIN_I18N.LANGS[code].v = { w: command id → whole-sentence phrasings, num: number words, fill: polite filler, s: spoken confirmations, names: language names }`.
  English, Hebrew, Yiddish written by hand (Yiddish: common unpointed spelling; points / ligatures are normalized away, so YIVO spelling matches too); the other 47 drafted per language as natural phrasings + a second pass for imperative/article forms. ~13,000 phrasings.
- **vcmd.js** (new, AIN_VCMD): `match(text, 'typed'|'call')` — the WHOLE sentence must be a command (filler like please/בבקשה/ביטע allowed; a second lookup without articles; the words exactly as said beat the filler-stripped words, so "לא עכשיו" = Not now, not No). Screen language + English always. Only commands for what is on screen (e.g. "take a picture" only with the camera open; "ingredients" only with a barcode result). A language name alone switches only by its own name ("Polski", "עברית"), so "polish"/"thai" stay searches. Never a code ("no", "it").
  `run()` does exactly what the button does (mostly by clicking the real button, so tracking/affiliate code is unchanged) and returns the short confirmation; `helpText()` = "What can I say?" for the current screen (Yes/No box, location box, Settings, Plan, camera, barcode, checkout, results, list, home).
- **Yes/No first** for everything that deletes, buys, pays or submits: go to checkout / checkout at {store}, subscribe, cancel subscription, remove number N from my list, forget number N, clear my history, forget my location (+ v23 delete my data). legal-common.js `AIN_LEGAL.confirm()` reuses the v23 clearAsk box (same dialog, big Yes / No), speaks the question with the phone voice outside a call, has a new **🎤 Answer by voice** button (one-shot speech recognition → yes/no), and in a call the AI asks the question and the person just says yes/no (ai.js confirmTurn). The Plan box's own mic ("subscribe", "cancel") and typed "forget the milk" / "forget my location" / the Clear-history button now use the same box. **Taps** on Remove / Forget / Forget my location / the checkout links are unchanged (one tap still does it) — say if you want those to ask too.
- **In a voice call** (ai.js): confirmTurn → speedTurn (v27) → quickTurn (v24) → **cmdTurn** (new): app commands are done on the phone and the AI is told the exact line to say ("Say only this… Nothing else"). Commands the AI already has a tool for (camera, barcode, buy/open/describe item N, list, history reorder, stores, orders, language, restore…) stay with the AI (AIN_VCMD.AI_IN_CALL) so a call behaves as before for those. Typed text during a call goes through the same chain (sendText). "End the conversation" / "hang up" / "סיים שיחה" / "ענדיק דעם שמועס" = one tap on "Tap here to end" (v26).
- **Typed outside a call** (app.js): speedTyped → AIN_VCMD.typed → the older substring commands (v13–v23) → search.
- Response speed and "delete my data" by voice now also work in Yiddish and the other languages (intent.js speed() consults vcmd; the Settings strings setH/speed*/clear* added for yi + 47 languages).
- sw cache ainshop-v28 (+ vcmd-i18n.js, vcmd.js). Test edits: v11.test.mjs (typed chain may include AIN_VCMD.typed), v27.test.mjs (sw v27+), e2e_v14.py (typed "forget my location" now asks Yes/No; the test taps Yes), e2e_v13.py (Clear-history button → big Yes/No box; the test taps Yes), e2e_v23.py (French now has its own Settings strings instead of the English/old fallback).
- In a call, a one-word yes/no ("हां", "是", "כן") is never dropped as noise while the Yes/No box is open (ai.js noise check skips AIN_VCMD.yesNo then).
- Results before publish: unit 250/250 (22 files); e2e_v28 1841/1841 (en, he, yi every command and every phrasing; fr, es, ru, ar, de, zh-CN, am, hi, uk); e2e_v14 71/71, v13 46/46, v22 68/68, v23 102/102, v24 44/44, v25 52/52, v26 28/28, v27 64/64, legal 66/66, checkout 42/42. e2e_pay (HTTP 403 at its first API call) and e2e_ui ("admin lists store") fail the same way on the v27 backup — not v28 changes. (Note: the dev server's daily voice-call allowance per test DB runs out after many suites; use a fresh DB if "voice call opens (fake)" fails.)
- v28 published 05:47 UTC (once); live sw.js reads ainshop-v28; Impact meta tags + Sovrn link present; against live: e2e_v28 (yi, ru) 368/368, e2e_v27 64/64.
- Not verifiable here: real iPhone speech recognition of these phrasings (the transcriber's spelling of Yiddish especially), the 🎤 Answer-by-voice button in iOS Safari / home-screen app, and whether the AI always says only the given line.

### v28 audit: every button, its voice / typed command
(first phrasings shown; every language has 4–20 per command. "AI:" = the voice call's AI tool, which already existed.)

| Screen | Button / link / setting | Before v28 | v28 English | v28 Hebrew | v28 Yiddish |
|---|---|---|---|---|---|
| Home | 🌐 language button (top) | — | "open settings", "settings" | "פתח הגדרות", "תפתח הגדרות" | "עפן די איינשטעלונגען", "עפן איינשטעלונגען" |
| Home | Settings (NEW big button, v28) | — | "open settings", "settings" | "פתח הגדרות", "תפתח הגדרות" | "עפן די איינשטעלונגען", "עפן איינשטעלונגען" |
| Home | Plan (top, when payments are on) | AI: subscription_info | "my plan", "open my plan" | "התוכנית שלי", "תוכנית" | "מיין פלאן", "פלאן" |
| Home | Tap to talk / Tap here to end | "goodbye" (AI end_conversation) | "start talking", "start a conversation"; "end the conversation" | "בוא נדבר", "בואי נדבר"; "סיים שיחה" | "לאמיר רעדן", "הייב אן רעדן"; "ענדיק דעם שמועס" |
| Home | Scan barcode | AI: barcode_scan | "scan a barcode", "scan barcode" | "סרוק ברקוד", "תסרוק ברקוד" | "סקען א בארקאד", "סקען דעם בארקאד" |
| Home | Camera: what is this? | AI: camera_open | "open the camera", "open camera" | "פתח מצלמה", "תפתח מצלמה" | "עפן די קאמערע", "עפן קאמערע" |
| Home | Checkout help (back to the last checkout) | AI: checkout_help | "checkout help", "help with checkout" | "עזרה בתשלום", "עזרה בקופה" | "הילף מיט באצאלן", "ווי באצאל איך" |
| Home | Track my delivery | typed + AI: "track my delivery" | "track my delivery", "track my order" | "עקוב אחרי המשלוח שלי", "איפה ההזמנה שלי" | "וואו איז מיין באשטעלונג", "וואו איז מיין פעקל" |
| Home | Return an item | typed + AI: "return an item" | "return an item", "return my order" | "החזר מוצר", "להחזיר מוצר" | "צוריקגעבן א זאך", "איך וויל צוריקגעבן" |
| Home | Orders panel: store links / Close | typed "track my Walmart order" | "track my delivery", "track my order"; "close" | "עקוב אחרי המשלוח שלי", "איפה ההזמנה שלי"; "סגור" | "וואו איז מיין באשטעלונג", "וואו איז מיין פעקל"; "מאך צו" |
| Home | Type box + Send | (is the typed path itself) | "what can i say", "what can i say here" | "מה אני יכול להגיד", "מה אני יכולה להגיד" | "וואס קען איך זאגן", "וואס קען איך דא זאגן" |
| Home | Notice OK (first visit) | — | "got it", "i understand" | "הבנתי", "אוקיי הבנתי" | "איך פארשטיי", "פארשטאנען" |
| Home | Shop tip (Sovrn sponsored link) | — | "shop tip", "open the shop tip" | "טיפ קניות", "הטיפ" | "שאפ טיפ", "קויף עצה" |
| Home | Found a mistake? (email) | typed + AI: "report a mistake" | "report a mistake", "send a correction" | "דווח על טעות", "תדווח על טעות" | "מעלדן א טעות", "מעלד א טעות" |
| Home | For stores – join | — | "for stores", "join as a store" | "לחנויות", "הצטרפות לחנויות" | "פאר געשעפטן", "פאר סטארס" |
| Home | Privacy / Terms / Contact links | — | "privacy policy", "privacy"; "terms of use" | "מדיניות פרטיות", "פרטיות"; "תנאי שימוש" | "פריוואטקייט פאליסי", "פריוואטקייט"; "די באדינגונגען" |
| Home | Contact link | — | "open the contact page", "contact page" | "צור קשר", "דף צור קשר" | "קאנטאקט", "קאנטאקט בלאט" |
| Results | Open at {store} (each result) | AI: open_product | "open number {n}", "open {n}" | "פתח מספר {n}", "תפתח מספר {n}" | "עפן נומער {n}", "עפן די נומער {n}" |
| Results | Describe (each result) | AI: product_details | "describe number {n}", "describe {n}" | "תאר מספר {n}", "תאר את מספר {n}" | "באשרייב נומער {n}", "באשרייב די נומער {n}" |
| Results | Buy (each result) | AI: checkout_prepare | "buy number {n}", "buy {n}" | "קנה מספר {n}", "תקנה מספר {n}" | "קויף נומער {n}", "קויף די נומער {n}" |
| Results | more / previous results | v24 local: "next", "back" | "next", "more"; "back" | "הבא", "הבאים"; "הקודם" | "ווייטער", "נעקסט"; "צוריק" |
| Checkout | Go to checkout (link) | AI: checkout_go after a yes | "go to checkout", "checkout" | "לקופה", "לך לקופה" | "גיי צום קאסע", "צום קאסע" |
| Checkout | Add to my list | AI: list_add | "add it to my list", "add to my list" | "הוסף לרשימה", "תוסיף לרשימה" | "לייג צו צו מיין רשימה", "לייג עס צו צו דער רשימה" |
| Checkout | Checkout help | AI: checkout_help | "checkout help", "help with checkout" | "עזרה בתשלום", "עזרה בקופה" | "הילף מיט באצאלן", "ווי באצאל איך" |
| Checkout | Card help | AI: checkout_help | "card help", "help with my card" | "עזרה בכרטיס", "עזרה עם הכרטיס" | "הילף מיט דער קארטל", "הילף מיטן קארט" |
| My list / carts | Remove (each item) | AI: list_remove | "remove number {n} from my list", "remove {n} from my list" | "הסר מספר {n} מהרשימה", "תסיר את מספר {n} מהרשימה" | "נעם אראפ נומער {n} פון דער רשימה", "נעם אראפ נומער {n} פון מיין רשימה" |
| My list / carts | Checkout at {store} | AI: list_checkout after a yes | "go to checkout", "checkout" | "לקופה", "לך לקופה" | "גיי צום קאסע", "צום קאסע" |
| My list / carts | (read the list) | AI: list_read | "read my list", "whats on my list" | "תקריא את הרשימה", "קרא את הרשימה שלי" | "לייען מיין רשימה", "לייען די רשימה" |
| Stores | All stores / store buttons / Back to {store} / All my carts | typed + AI: "all stores", "go to Walmart", "other store", "all my carts" | "all stores", "every store"; "all my carts" | "כל החנויות", "בכל החנויות"; "כל העגלות שלי" | "אלע געשעפטן", "אין אלע געשעפטן"; "אלע מיינע קארבן" |
| Stores | Close {store} | AI: store_close | "close {store}", "close the {store} store" | "סגור את {store}", "תסגור את {store}" | "מאך צו {store}", "פארמאך {store}" |
| Buy again | Buy again (each) | typed "buy the same milk again" + AI: reorder_item | "buy again number {n}", "buy number {n} again" | "קנה שוב מספר {n}", "קנה שוב את מספר {n}" | "קויף ווידער נומער {n}", "קויף נאכאמאל נומער {n}" |
| Buy again | Forget (each) | typed "forget the milk" + AI: forget_purchase | "forget number {n}", "forget item {n}" | "שכח את מספר {n}", "תשכח את מספר {n}" | "פארגעס נומער {n}", "מעק אויס נומער {n} פון דער היסטאריע" |
| Buy again | Show all (n) / Show fewer | — | "show more history", "show all my history"; "show less history" | "הראה את כל ההיסטוריה", "תראה את כל ההיסטוריה"; "הראה פחות" | "ווייז די גאנצע היסטאריע", "ווייז מער היסטאריע"; "ווייז ווייניגער" |
| Buy again | Clear history | typed + AI: "clear my history" | "clear my history", "delete my history" | "נקה את ההיסטוריה", "מחק את ההיסטוריה" | "מעק אויס מיין היסטאריע", "מעק אויס די היסטאריע" |
| Location | Use my location for faster delivery | typed + AI: "use my location", "my ZIP is …" | "use my location", "use my location for faster delivery" | "השתמש במיקום שלי", "תשתמש במיקום שלי" | "ניץ מיין ארט", "נוץ מיין ארט" |
| Location | Forget my location | typed + AI: "forget my location" | "forget my location", "delete my location" | "שכח את המיקום שלי", "תשכח את המיקום שלי" | "פארגעס מיין ארט", "מעק אויס מיין ארט" |
| Location box | Yes, use my location / No, I'll type a ZIP / Not now | — | "yes", "yes use my location"; "no" | "כן", "כן תשתמש במיקום שלי"; "לא" | "יא", "יא ניץ מיין ארט"; "ניין" |
| Location box | Not now | — | "not now", "later" | "לא עכשיו", "אחר כך" | "נישט יעצט", "ניט יעצט" |
| Location box | Save ZIP code | typed + AI: "my ZIP code is 48226" | "use my location", "use my location for faster delivery" | "השתמש במיקום שלי", "תשתמש במיקום שלי" | "ניץ מיין ארט", "נוץ מיין ארט" |
| Settings (🌐) | Delete AIN Shop data on this phone | v23 "delete my data" (en, he) | "delete my data", "delete my account" | "מחק את הנתונים שלי", "תמחק את הנתונים שלי" | "מעק אויס מיינע דאטן", "אויסמעקן מיינע דאטן" |
| Settings (🌐) | Response speed Fast / Normal / Slow | v27 "talk faster", "normal speed", "wait longer" (en, he) | "faster", "talk faster"; "slower" | "מהר יותר", "יותר מהר"; "לאט יותר" | "שנעלער", "רעד שנעלער"; "פאמעלעכער" |
| Settings (🌐) | language list (50 languages) | AI: set_language | "switch to {lang}", "change to {lang}" | "עבור ל{lang}", "תעבור ל{lang}" | "גיי איבער אויף {lang}", "גיי אריבער אויף {lang}" |
| Settings (🌐) | Close | — | "close", "close it" | "סגור", "תסגור" | "מאך צו", "מאך עס צו" |
| Plan box | Subscribe | Plan box mic + AI: subscribe | "subscribe", "subscribe to ain shop" | "הירשם למנוי", "תרשום אותי למנוי" | "אבאנירן", "איך וויל אבאנירן" |
| Plan box | Restore purchase | Plan box mic + AI | "restore purchase", "restore my purchase" | "שחזר רכישה", "שחזר את הרכישה" | "צוריקשטעלן דעם קויף", "שטעל צוריק דעם קויף" |
| Plan box | Cancel subscription | Plan box mic + AI | "cancel my subscription", "cancel the subscription" | "בטל את המנוי", "תבטל את המנוי" | "אנולירן דעם אבאנעמענט", "אנולירט דעם אבאנעמענט" |
| Plan box | Speak a command | (is a voice button) | "what can i say", "what can i say here" | "מה אני יכול להגיד", "מה אני יכולה להגיד" | "וואס קען איך זאגן", "וואס קען איך דא זאגן" |
| Plan box | Close | Plan box mic: "close" | "close", "close it" | "סגור", "תסגור" | "מאך צו", "מאך עס צו" |
| Camera | Take picture | AI: camera_take | "take the picture", "take a picture" | "צלם", "תצלם" | "נעם א בילד", "כאפ א בילד" |
| Camera | Close camera | AI: camera_close | "close the camera", "close camera" | "סגור מצלמה", "סגור את המצלמה" | "מאך צו די קאמערע", "פארמאך די קאמערע" |
| Barcode result | Find where to buy | AI: search_products | "find where to buy", "where can i buy this" | "איפה לקנות", "איפה אפשר לקנות את זה" | "וואו קען איך דאס קויפן", "וואו קויפט מען דאס" |
| Barcode result | Ingredients | AI: barcode_ingredients | "read the ingredients", "ingredients" | "תקריא את הרכיבים", "קרא את הרכיבים" | "לייען די אינגרעדיענטן", "אינגרעדיענטן" |
| Barcode result | Describe | AI: camera_open | "describe it", "describe this" | "תאר את זה", "תתאר את זה" | "באשרייב עס", "באשרייב דאס" |
| Barcode result | Open link (QR) | AI: qr_open_link | "open the link", "open link" | "פתח את הקישור", "תפתח את הקישור" | "עפן דעם לינק", "עפן לינק" |
| Yes/No box | Yes / No / (NEW) 🎤 Answer by voice | — | "yes", "yeah"; "no" | "כן", "כן בבקשה"; "לא" | "יא", "יא ביטע"; "ניין" |
| Anywhere | (NEW) What can I say? | AI app tour ("what can you do") | "what can i say", "what can i say here" | "מה אני יכול להגיד", "מה אני יכולה להגיד" | "וואס קען איך זאגן", "וואס קען איך דא זאגן" |
| Anywhere | (stop the phone voice) | v24 "stop" in a call | "stop", "stop talking" | "עצור", "תעצור" | "שטיל", "הער אויף" |
| Results / any read list | (v30) show the item being read | — | "show it", "show number {n}", "show me the {ord}" | "תראה לי", "תראה מספר {n}", "תראה את ה{ord}" | "ווייז מיר", "ווייז נומער {n}" |


## v29 (Nov 1, 2026) — the voice call never connected on the owner's iPhone (his 9:25 AM screen recording)
Backup of v28: ../backup-ainshop-v28 (site + test + README). Tests: node --test test/*.test.mjs (v29.test.mjs new) · python3 test/e2e_v29.py <url> [--live] (WebKit, iPhone UA, fake mic; --live opens one real call).
What the recording showed: mic prompt → "connecting" for about 1 s → back to "tap to talk", five times, nothing said. A WebKit run against the live site
connected fine from the box, so the failure was specific to his phone. Likely cause (strong guess, confirmed or not by /api/admin/diag after publish):
the per-device daily limit. ipSessionsDay 20 / ipMinutesDay 60 (each call reserves its full 10 min until it ends); the day's log showed 24 calls / 58 min,
so /api/ai/session answered 429 rate_limited in under a second. The app then called sayNative() from a network callback; iPhone speech stays silent
unless it was first used inside a tap, so the "daily limit" sentence was never heard, and #status sits below the fold.
- Server: DEFAULTS ipSessionsDay 60, ipMinutesDay 180 (also set live in kv config at 14:33 UTC before the publish); dailyBudgetCents 2500 still caps money.
  finishCall: a call that ends under SHORT_CALL_S (15 s, any reason but 'time') gives back its ipn count (failed connects don't use up the day).
  POST /api/ai/fail: the phone's own failure report (key, detail, step trace, UA; cleaned to [\w:.-/ ,=+()@], 50/address/day, table client_fail,
  deleted after FAIL_RETAIN_DAYS 30 in prune). POST /api/admin/diag (setup token, body {day}): today's ipn/ipm counters (hashed addresses),
  ai_log rows, client_fail rows. 402 no_credit is no longer shown as the paywall (BAIN_PAY.blocked only for other 402s).
- Client (ai.js): every connect step traced with ms since the tap (mic:ask|reuse, mic:ok, offer, session:<status>, answer:set, ice:*, pc:*, dc:open, fail:…).
  primeSpeech() inside the tap (silent ' ' utterance, cancelled at once) so a later failure can be spoken. fail(): ONE sentence t(key) spoken,
  shown under the button with the reason in brackets (st.failNote, cleared on the next tap), status line = sentence + typeInstead + reason,
  localStorage bain:lastfail, report to /api/ai/fail (skipped in tests unless window.BAIN_REPORT_TEST).
  Microphone kept (tracks disabled) for MIC_KEEP_MS 45 s after a call ends or fails and reused on the next tap → no second permission prompt;
  released on stop('hidden'), page hide, leaving the app, or mic refusal. A repeated tap in the first 4 s of "connecting" no longer cancels it.
- Old tests touched: v11 (pagehide teardown(true); ipSessionsDay any number), v28 (sw version v28 or later).
- Published Nov 1 2026 14:50 UTC (once); live sw.js reads ainshop-v29; ai.js + sw.js byte-identical to site/; HSTS + CSP headers, Impact meta tags, Sovrn link present.
  Against live: e2e_v29 --live 21/21 (real call on WebKit iPhone profile: on in 1.5 s). Dev: unit 257/257, e2e_v29 18/18, v28 761/761 (en,he,yi), v27 64/64, v26 28/28,
  v25 52/52, v24 ok, v23 102/102, v22 68/68, v18 38/38, v14 71/71, v13 46/46, v11 52/52, awake, checkout 42/42, legal 66/66. e2e_ui (search 3), e2e_pay (2) and
  e2e_barcode fail the same way on the v28 backup (dev search/pay environment), not v29.
- What /api/admin/diag showed right after publish (his device = the address with 22 calls, 73.9 reserved+charged minutes today): during his 9:23–9:25 AM
  recording the server OPENED calls (14:23:39, 14:23:46, 14:25:27, 14:25:30, 14:25:44 UTC). Two ended from the phone after 1 s ('user'), three were
  never used by the phone (no_heartbeat, charged ~100–180 s each; 'time' rows overnight are the same, charged 11 min). So the app itself dropped the
  call within ~1 s of opening, or before the answer arrived: a second tap during "connecting" (v28 treated it as cancel) or a failure after the answer
  (now spoken + reported). The orphaned calls also ate his daily minutes (73.9 > old 60 cap), so the limit was next in line.
  Follow-ups not shipped (one publish): end an orphaned call when its answer arrives after a cancel (POST /api/ai/end with x-bain-call); an audible tick on
  the tap so a blind user knows it started.


## v30 (Nov 1, 2026) — DESCRIBE AND SHOW, a tick on the talk tap, given-up calls closed on the server
(Nati, 9:28 AM: "while he's describing every option, scroll down and show that option on the screen ... Describe and show, same time.")
Backup of v29: ../backup-ainshop-v29 (site + test + README). Tests: node --test test/*.test.mjs (v30.test.mjs new) · python3 test/e2e_v30.py <url> [shot.png]
(WebKit, iPhone UA/size, a fake voice call fed the realtime events; searches answered by a route).
- site/show.js (window.AIN_SHOW, loaded before ai.js, in the offline shell). WHICH items: from the AI's tool calls (handleCalls → AIN_SHOW.fromTool):
  search_products / open_store / store_switch / store_back → the 3 it reads; more_results → those; product_details, open_product, checkout_prepare,
  list_add → that one; compare_products → those; next / back (quickTurn) → the next / previous 3; list_read, carts_read (one store),
  get_purchase_history → a card is MADE for each entry that has none (#spotSec "Now showing", picture/name/price/store, i18n key spotH in 50 languages).
  The first item lights at once. WHEN inside one spoken answer: the realtime model sends one audio stream per answer and no event per item, so
  the answer's own transcript (response.output_audio_transcript.delta, filtered by response_id) gives where item k starts (its number word from
  the vcmd number words of the screen language + English, its price, a word of its short name; "I found 12" before item 1 never counts), laid on the
  audio clock (output_audio_buffer.started + characters per second, learned per language on this phone from each finished answer, localStorage
  bain:showRate; defaults he 12.5, en 15). If an item is never named, the rest of the words are shared evenly. "Still looking" answers (metadata.nudge)
  are ignored. output_audio_buffer.cleared (he cut in) / quickHush / stop → the light freezes on the item being read and the AI gets a system line:
  "On the screen now, lit up: item N ... 'this one' = item N". An answer that only called another tool keeps the list for the next answer.
- The lit card (.spot): scrolled into view (centred, or from its top when taller than 3/4 of the screen; smooth unless reduced motion), black on
  yellow (#ffd400), white frame, title 36 px, price 38 px, photo up to 260 px. S.spot keeps it through render(); a new search / store switch resets it.
  The Describe button (no call) lights its card too. Focus is NOT moved (the voice is talking).
- Full voice (vcmd): show_n "show number {n}" / "show me the {ord}" and show_cur "show it" / "where is it on the screen", in all 50 languages
  (en/he/yi by hand; the other 47 drafted per language, phrasings that already meant open_n in a language were left out), confirmations
  show_n / show_cur / noShow. Handled on the phone in a call too (not in AI_IN_CALL); the AI says the line.
- Tick: ai.js tick() — a soft ~40 ms wooden tick (1250 + 2500 Hz, quick decay, 0.3 amplitude, element volume 0.7), a plain <audio> blob like blip/cue,
  played INSIDE the tap in start() before the microphone is asked, and again on a repeated tap while connecting. Off with localStorage bain:tick=off.
- Calls the app gave up on (server, _worker.js): (1) the app sends x-bain-app (one random id per page load) with /api/ai/session; before counting,
  the server closes that app's older open calls (stored in live_calls.uid) as 'superseded' (hung up upstream). (2) /api/ai/end {gave_up:true}: sent by
  fail() and stop() while still connecting, and by endOrphan() when the answer arrives after the app already let go → 'gave_up'. (3) /api/ai/fail
  with {call}: closes that call if it is the same address's → 'gave_up' (answer {closed}). (4) The app now heartbeats the moment the call is live;
  a call never heard from (last = start) is closed by the sweep after NEVER_HEARD_S 45 s as 'abandoned', charged at most 45 s. superseded / gave_up /
  abandoned give back the day's call count whatever their length, at most GAVE_UP_DAY 40 a day per address (kv ipgu:); minutes were already refunded
  for unused time. 60 calls / 180 min per phone and the $25 money cap unchanged. ai_log has ip8 (first 8 of the hashed address); /api/admin/diag
  returns calls[].ip8 + cents and open[] (live calls), so the next read says which device a call was.
- Old tests touched: the cache-version regexes in barcode, checkout, i18n50, pay, scope, v11, v13, v14, v19, v20, v22–v27, v29 accept v30+.
- Results before publish: unit 273/273 (23 files; v30.test.mjs 16 new); e2e_v30 28/28 (dev); e2e_v29 18/18, v28 761/761 (en, he, yi), v27 64/64, v26 28/28,
  v25 52/52, v24 44/44, v23 102/102, v22 68/68, v18 38/38, v14 71/71, v13 46/46, v11 52/52, awake all pass, checkout 42/42, legal 66/66.
- Published Nov 1 2026 15:26 UTC (once, site version 22); live sw.js reads ainshop-v30; the 10 changed files byte-identical to site/; CSP + HSTS headers,
  Impact meta tags, Sovrn link present; /_worker.js and /tab-site.json 404. Against live: e2e_v30 28/28, e2e_v29 --live 21/21 (one real call).
- His phone after v29 (diag, his address = ipn/ipm 7b749b1b…): 14:54:26 UTC a call of 48 s ended from the phone (usage-priced 2.3¢ = a real
  conversation; app language en); 15:12:40 UTC a call of 4 s ended from the phone (count given back as short). No failure reports from his phone.
  The 4-second one fits a second tap AFTER the call was already on (v29 guards only the "connecting" state; once on, one tap ends the call).
  Follow-up not shipped (one publish): ignore a repeated tap within ~4 s of the first tap in any state, not only while connecting.
