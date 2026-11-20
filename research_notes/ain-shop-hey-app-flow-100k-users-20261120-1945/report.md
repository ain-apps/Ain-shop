# Voice-only shopping app — piece-by-piece breakdown

**Flow:** open app → say “hey app” → “find me black running shoes size 10 under 100 dollars” → hear top results read aloud → pick one by voice → buy it.
**Platforms:** iPhone, Android, web. **Languages:** 50. **Scale target:** 100,000 people at the same time, without crashing.

**How to read this:** prices and limits were checked on 2026-11-20. OpenAI pricing and rate-limit pages were opened live that day (`verified live`). Most other figures are from the vendor pages via search-index summaries (`index`) — re-check them on the vendor page before signing or budgeting. All “what 100,000 users costs” figures are **my arithmetic from those sourced rates**, with the assumptions stated in §8 — no vendor publishes a 100,000-simultaneous-user price.

## Summary

Do **not** build this as one live voice call per user. Build it as a **cheap, mostly on-device pipeline** — wake word on the phone, speech-to-text on the phone, a cheap text model to understand the request, a cheap search API to find products, free on-device speech to read the answer — and keep the expensive live speech-to-speech model as an optional premium mode. That is the only version that survives 100,000 simultaneous users at a sane price: roughly **$0.001–0.016 per active minute per user** for the cheap pipeline, versus **$0.05–0.11 per minute (realistic, cached) and up to ~$0.30–0.46 uncached** for OpenAI Realtime. At 100,000 simultaneous active minutes that is roughly **$100–$1,600/min cheap vs $5,000–$11,000/min realtime flagship** — and, more importantly, Realtime hits OpenAI’s hard token ceiling at roughly **8,000–15,000 simultaneous users** on one account, so 100,000 on Realtime alone is not a pricing problem, it is a hard stop.

Two honest limits up front:

1. **“Hey app” cannot work like “Hey Siri” when the app is closed, especially on iPhone.** Apple reserves system-level wake words for Siri; a third-party app can only listen while it is open (or in background-audio mode, with the microphone indicator on and App Store scrutiny). On the web it cannot listen at all once the tab is hidden or the screen locks.
2. **Searching the whole web is not the same as being able to buy from the whole web.** A search API can *find* a shoe anywhere; you can only *check out* where you have a checkout route (your own store, a retailer integration, Stripe + Apple/Google Pay). Everywhere else the honest ending is “here it is at [seller], I can open their checkout for you” — not a fake in-app purchase.

---

## 1. Wake word (“hey app”)

### How it works without draining the battery or phoning home
The phone runs a tiny “keyword spotter” all the time. It keeps only a rolling buffer of a few seconds of audio, scores each 80 ms chunk against the one phrase, and throws the audio away if it does not match. Nothing is recorded, transcribed or sent to a server until the score crosses a threshold. Only then does the app open a real listening session. That two-stage design — local spotter, then real recogniser — is how Siri/Assistant do it, and it is the privacy boundary that matters: before the trigger, audio goes nowhere; after it, words travel to a server (if you use a cloud recogniser).

Because the model is tiny (Porcupine reports ~1 MB, under 4% of one Raspberry Pi 3 core), it sips power. No vendor publishes a clean “% battery per hour” for a phone; secondary reports put comparable engines at roughly 1–3% per hour — treat that as an estimate, not a guarantee, and measure on a real phone.

### Options

| Option | Cost | Accuracy / false triggers | Languages / notes |
|---|---|---|---|
| **Picovoice Porcupine** (commercial, closed) | Free plan: $0, non-commercial only, **1 monthly active user**. Foundation: **$6,000/year for 100 monthly active users**. Enterprise: **from $30,000/year**. | Vendor: **97%+ detection, <1 false alarm per 10 hours** (2.7% miss rate in its benchmark). Independent test: 3.1% false reject, 0.2 false accepts/hour. Best raw accuracy of the free/paid options tested. | 9 languages listed (English, Mandarin, French, German, Italian, Japanese, Korean, Portuguese, Spanish). Custom phrase (“hey app”) is made in Picovoice Console and downloaded as a `.ppn` file. Needs an AccessKey to start. |
| **openWakeWord** (open source, Apache 2.0) | **$0, no per-user fee.** | Target: **<0.5 false accepts/hour and <5% false rejects** with threshold tuning. Independent test: 4.2% false reject, 0.3/hour false accept — close to Porcupine. | Pre-trained models are **English only**. A custom “hey app” model must be trained — from synthetic TTS speech, no manual recording — and a model per phrase/language. ONNX, runs on CPU. |
| **Apple / Android built-in** | $0 | — | **There is no built-in custom wake-word API.** Apple reserves the OS layer for Siri and gives third-party apps no way to register “hey app” system-wide. Android has no OS wake-word API either. You must build it yourself in the app (see limits below). |
| **Web (browser)** | $0 | Poor | No true always-on wake word. See limits below. |

Sources: Porcupine accuracy/pricing — https://voxrt.com/wake-word-comparison ; https://outspoken.cloud/blog/best-wake-word-tools ; https://www.exploreai.directory/tools/picovoice ; openWakeWord targets — https://pypi.org/project/openwakeword/0.1.1/ ; independent test — https://get.jinn.today/blog/jinn-wake-word-system ; iOS limits — https://picovoice.ai/blog/ios-speech-recognition/ ; privacy model — https://www.heyviolet.io/learn/wake-words-and-privacy

### False triggers, and what to do about them
- “Hey app” is short and generic, so it will false-trigger more than a distinctive phrase like “Hey Jarvis”. Tune the sensitivity/threshold (higher = fewer false alarms, more missed wake words), and require a short confirmation: a chime + “Yes?” and only then listen for the request. If the next 2–3 seconds contain no speech, go back to sleep and discard the audio.
- A false trigger is a privacy event, not just an annoyance: audio after a false trigger *does* get sent to the recogniser. So: never store false-trigger audio, and say so in the app.
- Expect ~1 missed wake word in 20–30 tries even when tuned well (3–5% false reject). The fix is a visible fallback: a big tap-to-talk button and “say it again” — essential for blind users, who cannot see that the app missed them.

### Platform limits — the part that changes the design
- **iPhone:** no system wake word. The app must declare the `audio` background mode and keep an `AVAudioSession` running; iOS shows the microphone indicator, phone calls/Siri can take the mic, and App Store review scrutinises background-audio-for-wake-word (it is meant for music/VoIP, not always-on listening). With the app closed by hand, iOS does not relaunch it for audio. Practical rule: **wake word works while the app is open; outside the app, offer a Siri Shortcut / Action Button instead.**
- **Android:** more permissive — a foreground service can keep listening in the background, with a persistent notification. Still needs `RECORD_AUDIO` and battery-optimisation exemptions.
- **Web:** browsers deliberately do not let a page use the mic once the page is hidden or the screen locks; service workers cannot touch the mic. Chrome’s Web Speech API also auto-stops after ~3 seconds of silence and must be restarted, Safari does recognition on Apple servers, Firefox has no Web Speech support. Practical rule: **web = tap-to-talk (or hold the screen awake with Wake Lock), not always-on “hey app”.**

Sources: https://picovoice.ai/blog/ios-speech-recognition/ ; https://www.signaltrace.wiki/voice-activated-help/TechnicalConstraints/iOS-Background-Audio-Constraints ; https://vadimall.com/posts/voice-ai-assistant-browser-typescript-web-speech-api

### Recommendation for this piece
Ship **openWakeWord on Android/web-app builds and Porcupine only if you can pay Enterprise** — Porcupine’s published tiers stop at 100 monthly active users for $6,000/year, which does not cover 100,000 users at all (see §8). Train one “hey app” model per language you actually launch in; do not promise 50-language wake words on day one. Wake word runs **100% on-device, $0 per user, scales automatically** — it is never the bottleneck.

---

## 2. Hearing the request (speech-to-text)

No custom model training — use existing services as-is. The right order is: **native on-device first, Whisper on-device second, cloud only as a last resort.** All three are free at the point of use except cloud.

| Engine | Where it runs | Languages | Accuracy / notes | Cost |
|---|---|---|---|---|
| **Apple SpeechAnalyzer / SpeechTranscriber (iOS 26+)** | Entirely on-device; language packs downloaded once by the system | **42 locales, 22 languages** (Aug 2026): incl. English, Spanish, French, German, Italian, Portuguese (Brazil only), Chinese, Japanese, Korean, Arabic, Russian, Dutch, Turkish, Thai, Vietnamese. **No Hindi, Polish, Czech, Greek, Ukrainian, Indonesian.** | Best on its supported languages in benchmarks: **2.12% word error rate on clean LibriSpeech** (vs 3.74% for Whisper in the same write-up). Gives fast provisional text, then final text — good for live use. | $0 |
| **Apple SFSpeechRecognizer (iOS 10+, older)** | On-device if `requiresOnDeviceRecognition = true`, else can fall back to Apple servers | Similar locale list, incl. some SpeechAnalyzer lacks | **Hard limit: 1 minute of audio per request, 1,000 requests per device per hour** (device-wide, shared with other apps). Restart the session for longer speech. | $0 |
| **Android ML Kit GenAI Speech Recognition (new, Nov 2026)** | On-device | **100+ languages**, 10x real-time | Basic mode: most Android devices, API 31+. Advanced mode (Gemini Nano, broader coverage/better quality): Pixel 10 devices only at launch. Adds 0 MB to the APK (models live in the OS). | $0 |
| **Android SpeechRecognizer (older)** | On-device or Google servers depending on device/settings | Varies by device | The pre-ML-Kit path; use ML Kit where available. | $0 |
| **Whisper — WhisperKit (iOS) / whisper.cpp (Android, web via WebAssembly)** | Entirely on-device, Neural Engine / CPU | **99 languages**, auto-detection, handles mid-sentence language switching | Robust to noise and accents; model sizes tiny 39 MB → large-v3 1.5 GB. Pick tiny/base for a phone (fast, good enough for short shopping commands), small for better accuracy. Free, open source. | $0 (one-time model download) |
| **Cloud fallback: Deepgram Nova-3 streaming** | Server | 60+ languages | Streaming, billed per second. Use only when on-device fails or the language is missing. | **$0.0048/min promotional, $0.0077/min list** (monolingual); multilingual $0.0058 promo / $0.0092 list |
| **Cloud fallback: OpenAI gpt-realtime-whisper** | Server | — | $0.017/min of audio (from OpenAI pricing page). | $0.017/min |

Sources: SpeechAnalyzer — https://loronote.com/en/blog/apple-speechanalyzer-vs-whisper ; https://blog.addpipe.com/apple-speechanalyzer-api/ ; SFSpeechRecognizer limits — https://picovoice.ai/blog/ios-speech-recognition/ ; ML Kit — https://developers.googleblog.com:443/on-device-speech-recognition-and-text-to-speech-in-google-ai-edge-gallery/ ; Whisper — https://dodecaidr.pro/en/articles/whisperkit-on-device-transcription/ ; https://www.x-cmd.com/install/whisper.cpp/ ; Deepgram — https://deepgram.com/pricing?ps_partner_key=Y29sb3JtYW5nb2xlZTk4MzU&ps_xid=WliiExMdHTl0bx&gsxid=WliiExMdHTl0bx&gspk=Y29sb3JtYW5nb2xlZTk4MzU ; OpenAI transcription — https://developers.openai.com/api/docs/pricing?multimodal-image-pricing=batch

### Which hears best?
- **On its 22 languages, Apple SpeechAnalyzer** — lowest error rate in the cited benchmark, fastest, and free.
- **For coverage, Whisper** — 99 languages, roughly five times Apple’s list, and the only on-device option that covers Hindi, Polish, Ukrainian, Indonesian, etc.
- **For Android breadth, ML Kit** — 100+ languages on-device, but Advanced mode is Pixel-only at launch, so do not assume it on every phone.

### What happens when a language is not covered?
Chain the fallbacks in this order, and be honest when the chain ends:
1. Native (SpeechAnalyzer / ML Kit) → 2. Whisper on-device (99 languages) → 3. Cloud STT (Deepgram / OpenAI) → 4. If still uncovered: **say so in the user’s language if you can detect it, or in English, and offer the closest option** (“I can hear English, Spanish and French — which would you like?”). Never silently transcribe a language the model does not know — that produces confident nonsense, and for a shopping app that means ordering the wrong thing.
- Note the 50-language promise is about the *app* (STT + understanding + TTS + search in that language). The wake word, the STT and the TTS each have their *own* language list, and the intersection is smaller than 50 on day one. Launch with the intersection, add languages as Whisper/cloud cover them.

### Scale note
On-device STT scales automatically — 100,000 phones do 100,000 transcriptions for $0 and zero server load. Cloud STT is the only part that hits a server, and it is priced per audio minute, so it is the first server bill to grow (see §8).

---

## 3. Understanding the request

### Cheap text model (recommended default)
The transcript is text. Send it to a cheap text model with **function calling / structured output** and a strict schema — no free-form chat:

```json
{"intent":"search","item":"running shoes","colour":"black","size":"10","max_price_usd":100,"sort":"relevance"}
```

- The model’s job is only to extract those fields, plus handle “the second one” / “the cheaper one” (see below). It does not need to be clever, and it does not need to know about shoes.
- Cost example: **GPT-4o mini, $0.15 per 1M input tokens / $0.60 per 1M output tokens** (cached input $0.075). A typical request (1,000 input / 2,000 output tokens) costs ~$0.0013; a short shopping parse ( ~1,000 in / ~300 out) costs ~$0.0003. Sources: https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/?ref=rojo.me ; https://models.litellm.ai/models/gpt-4o-mini — note that page also lists a deprecation date of 14 Jan 2027 for `gpt-4o-mini`, so at build time use the current cheap-class successor at the same order of magnitude and verify its price; do not hard-code a model name that may be retired.
- Keep the prompt tiny and cached (same system prompt every time) so most input tokens are cached.
- Validate the output on your server: if `max_price` is missing or absurd, ask the user (“under how much?”) instead of guessing. Never invent a size, colour or price.

### Live voice session (the alternative)
In OpenAI Realtime / GPT-Live the model hears audio directly, holds the conversation in its session, and can call tools (search, checkout) mid-conversation. It feels more natural and remembers context for free — but you pay per audio token for the whole session, including silence and re-sent history (see §6/§8), and you lose the clean transcript + structured-output control unless you add it back.

### Remembering context (“the second one”, “the cheaper one”)
Keep the **last result list on the phone (or in a short-lived server session)** — the 3–10 products you just read out, with their IDs, prices and order. Then:
- “The second one” = item #2 in that stored list. No new search.
- “The cheaper one” = sort that stored list by price, pick the cheapest. No new search.
- “Show me more” / “next three” = next page of the *same* stored search, or one new search call with `page=2`.
- A new request (“red ones instead”) = new search, and it replaces the stored list.
- Keep only the last 1–2 turns of history in the model prompt (or a 1–2 sentence summary). Sending the whole conversation every turn is what makes Realtime bills snowball. Session state should expire after ~10 minutes of silence.

### Scale note
Understanding is a **stateless HTTP request** (transcript in, JSON out). That is the easiest piece to scale: no session affinity, add more servers, cache nothing personal. It is cheap enough that it is never the bottleneck — unless you route it through a live voice session, in which case see §8.

---

## 4. Finding products (web search)

Use a cheap search API from your server (never put the API key in the app). Two honest options:

| API | Price | Rate limit | What you get | Catch |
|---|---|---|---|---|
| **Brave Search API** | **$5 per 1,000 requests = $0.005 per search.** $5 monthly credit (~1,000 searches). No free tier since Feb 2026; card required at signup. | **50 requests/second** (= 3,000/min) | Own independent index (~30B pages), web/news/images/video, LLM Context endpoint. Up to 20 web results per call. | **Terms (1 Sep 2026) forbid storing/caching results beyond transient storage, creating derivative works, and using results to train/benchmark AI models.** So you cannot cache Brave results to save money at scale. Attribution required. |
| **Serper (Google Search API)** | **$1.00 per 1,000 at entry ($50 pack), $0.75 at 500k, $0.50 at 2.5M, $0.30 at 12.5M** — i.e. $0.001 → $0.0003 per search. **2,500 free queries once, no card.** Credits expire after 6 months. | **50–300 requests/second** by pack (50 at Starter, 300 at Ultimate) | Google results as clean JSON, incl. a **Shopping endpoint** returning product title, price, merchant/seller, rating, review count, link, delivery info. 1 credit for up to 10 results, **2 credits for 11–100 results**. | Google Shopping data, not a retailer’s own live stock feed (see §5). Check Serper’s terms on caching before you cache. |

Sources: Brave — https://www.stork.ai/en/brave-search-api ; https://parallel.ai/compare/brave-vs-parallel ; terms — https://cloro.dev/comparisons/brave-search-api-alternatives/ ; Serper — https://dev.to/serpkite/serp-api-pricing-in-2026-1000-google-searches-on-10-apis-2ml9 ; https://hasdata.com/blog/best-serp-apis ; shopping fields — https://taskfuel.ai/tools/serper-mcp/

**Recommendation:** Serper Shopping as the primary search (it is 5–17× cheaper per search than Brave and returns structured prices), Brave as failover. One search per user request — not one per result, not one per spoken sentence.

### How results get read aloud
- Say the **count first, then the top 3**: “I found 24 black running shoes under $100. Here are the top three. One: Nike Revolution, $65 at Nike, 4.5 stars. Two: … Three: … Say a number to pick one, or say ‘more’ or ‘cheaper’.”
- Keep each item to **one short sentence**: name, price, seller, rating if present. Do not read URLs, long descriptions, or review text.
- “More” reads the next three; scrolling (for sighted helpers / web) shows the same list visually. The spoken list and the on-screen list must match, in the same order.
- If a search returns 0 results, say so plainly and offer the nearest fix (“nothing under $100 — shall I try under $120?”) instead of inventing a product.

### Scale note
Search is a server call, so it *does* hit a ceiling: Brave 3,000/min, Serper up to 18,000/min. At 100,000 simultaneous users that is not enough if everyone searches in the same minute — but in practice users do not all search in the same second; they talk, listen, decide. The fix is a queue + “please wait” (see §8), plus de-duplicating identical popular queries where the terms allow it.

---

## 5. Prices and stock — check before the user buys, without guessing

**A search result price is a snapshot, not a promise.** Google Shopping / Serper returns a price and a merchant as Google last saw them. It does not guarantee the item is in stock at that price right now, in the user’s size, at checkout.

The safe flow, every time, before any money moves:

1. **Search** → shortlist (price as listed, labelled as such when read aloud).
2. **User picks one** → your server re-checks *that exact offer* at that moment: call the Shopping sellers/product endpoint again for that product ID, and/or fetch the retailer’s product page / retailer API for price + availability + size. Use the structured `availability` / `price` / `total` (price + shipping) fields where the API returns them.
3. **If the price changed or it is out of stock:** read the *new* price aloud and ask for fresh confirmation (“It’s now $109, not $95 — still want it?”) or say it is out of stock and offer the next one. **Never charge the old price, and never charge for an item you have not just verified.**
4. **Only then** create the payment (see §7) for the verified total, including tax and shipping — read that total aloud as part of confirmation.

Sources for what the APIs return: Serper Shopping returns price, merchant, rating, link — https://taskfuel.ai/tools/serper-mcp/ ; Google Shopping seller offers return merchant, price, shipping, total, availability, delivery — https://glama.ai/mcp/connectors/com.crawlerdata/google-shopping-serp ; Google’s own Shopping filters score offers on confidence in price, stated stock and page quality — https://think.resoneo.com/google-shopping-ai-mode/

**What I could not verify:** no public, cheap, whole-web “live stock” API exists that guarantees stock for every retailer. Retailer-specific APIs (e.g. a store’s own catalogue) do, but only for that store. So the honest architecture is: search the web to *discover*, then verify the *chosen* offer at checkout time, and be ready to say “sorry, it just sold out” — that failure mode must be designed in, not hidden.

---

## 6. Talking back (TTS vs live speech-to-speech)

### On-device TTS (recommended default)
- **iOS `AVSpeechSynthesizer`**: free, built in, 50+ languages/dialects, rate/pitch/volume control, voices can be downloaded. **Android Google Text-to-Speech**: free, preinstalled on most phones, ~40+ languages (voice data downloaded in Settings). **Web `speechSynthesis`**: free, voices vary by device/browser.
- Cost: **$0 per minute, $0 per user, scales automatically.** Latency: starts speaking in ~100 ms on the new Android ML Kit TTS; iOS is similarly immediate for short utterances.
- Quality: clear and reliable, but flatter / more robotic than the best cloud voices. For reading a price list, that is fine. For a warm conversational companion, it is noticeably less natural.
- Sources: https://www.tutorialpedia.org/blog/iphone-api-for-text-to-speech-feature/ ; https://frateca.com/blog/best-text-to-speech-engine-for-android/ ; https://developers.googleblog.com:443/on-device-speech-recognition-and-text-to-speech-in-google-ai-edge-gallery/

### Cloud TTS (when you want a nicer voice)
- **OpenAI `tts-1`: $15 per 1M characters; `tts-1-hd`: $30 per 1M.** At ~800–900 characters per minute of speech, that is ~$0.012–0.014/min (`tts-1`). **ElevenLabs: $40 per 1M characters (Flash/Turbo) to $80 per 1M (v4/Multilingual v2)** — ~$0.032–0.064/min at 800 chars/min, most natural, 90+ languages on v4. Google Cloud / Amazon Polly standard voices are ~$4 per 1M (~$0.004/min).
- Sources: https://www.assemblyai.com/blog/tts-api-pricing ; https://developers.openai.com/api/docs/pricing?multimodal-image-pricing=batch
- Note: OpenAI lists `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` for shutdown on 6 Jan 2027, with `gpt-realtime-2.1-mini` as the recommended replacement — verify the current TTS model at build time.

### Live speech-to-speech (OpenAI Realtime / GPT-Live)
- One model hears audio and speaks audio, no STT→LLM→TTS handoffs. Feels the most natural: emotion, interruption handling, sub-320 ms first-audio latency in the original Realtime launch.
- **Price (verified live, OpenAI pricing page, 2026-11-20): `gpt-realtime-2.1` audio $32 per 1M input tokens, $0.40 cached input, $64 per 1M output tokens; text $4/$24. Mini: audio $10/$0.30/$20, text $0.60/$2.40. GPT-Live (`gpt-live-1.1`): $0.05 per active minute, $0.02 per standby minute, billed per second, plus the backend model’s tokens on top.**
- Source: https://developers.openai.com/api/docs/pricing?multimodal-image-pricing=batch
- **What that means per minute:** 1 minute of heard audio is ~600 tokens, 1 minute of spoken audio ~1,200 tokens. A realistic mixed conversation (user speaks ~40% of the time, agent ~60%) with prompt caching working costs **~$0.05–0.11/min on the flagship, ~$0.02–0.05/min on the mini** (ForaSoft, re-checked 8 Nov 2026). Without caching, or with long un-truncated history re-sent every turn, it rises to **~$0.30/min and, in the worst runaway case, ~$0.46/min** — the “quadratic cost trap” where prior audio is re-billed every turn. Fix it by truncating/summarising history every few turns and using cached input.
- Sources: https://www.forasoft.com/blog/article/openai-realtime-api-pricing ; https://forasoft.medium.com/openai-realtime-api-production-voice-agents-2026-9d4e861a6dcc

### Can the cheap pieces still feel like a live conversation?
Yes — with a streaming pipeline framework. **Pipecat** (BSD, Daily) and **LiveKit Agents** (Apache 2.0) are both open-source Python frameworks that wire STT → LLM → TTS as a streaming pipeline, with:
- **Voice activity detection (Silero VAD, Pipecat Smart Turn v3 / LiveKit TurnDetector)** to know when the user has finished — and when they have started talking over the app.
- **Barge-in / interruption:** on detected user speech, cancel the LLM/TTS task and flush the audio buffer immediately, so the app stops mid-sentence instead of talking over the user.
- **Streaming:** LLM tokens are streamed sentence-by-sentence into TTS, so the first spoken word arrives in ~800 ms–1.5 s for a cascaded pipeline, vs ~300–500 ms for a single speech-to-speech model. That gap is noticeable but acceptable for shopping; it is not acceptable for a phone-call-style argument.
- Pipecat is transport-agnostic (Daily, WebRTC, WebSocket, Twilio, LiveKit); LiveKit Agents is tied to LiveKit rooms but gives you dispatch, load balancing and SIP in one system.
- Sources: https://sheerbit.com/pipecat-vs-livekit-agents/ ; https://github.com/sebduffy-prog/sebduffy/blob/HEAD/skills/voice-agents/realtime-voice-agent/SKILL.md

**Recommendation:** cheap pipeline + Pipecat/LiveKit-style streaming, VAD and barge-in, on-device TTS by default, cloud TTS (ElevenLabs Flash or OpenAI `tts-1`-class) as a paid upgrade. Reserve Realtime for a premium tier with a per-minute cap.

---

## 7. Buying — checkout by voice, safely, card never typed into the app

### The shape
1. App reads the **final confirmation aloud and waits for an explicit “yes”**: item, size/colour, seller, price, shipping, tax, **total**, delivery address (last line only, e.g. “to your home address ending in …”), and payment method (“with your Apple Pay card ending 1234”). No purchase happens on a single vague “buy it”.
2. User says **“Yes, buy it”** (or taps / uses Face ID). That is the second, separate confirmation — picking the item is not buying it.
3. Your **server** creates a Stripe **PaymentIntent** for the verified total and returns only its `clientSecret` to the app. The app opens **Stripe Payment Sheet**, which shows Apple Pay / Google Pay / saved card.
4. User confirms with **Face ID / Touch ID / device PIN** in the wallet sheet. Stripe handles 3D Secure (3DS2) / bank-app redirects if the bank requires them.
5. Stripe tells your server (webhook) the payment succeeded. Only then do you place the order with the seller / confirm fulfilment. Send a spoken + written receipt and order number.

### Why the card is never typed into the app
- **Apple Pay / Google Pay tokenise the card:** the real card number is replaced by a Device Account Number stored in the phone’s Secure Element; the merchant never receives or stores the actual number. Apple Pay adds no extra merchant fee.
- **Stripe Payment Sheet / Payment Element** collects any card details inside Stripe’s sheet, not your app; card data goes directly to Stripe, which is PCI DSS Level 1 certified. Your app and server only ever hold a token / PaymentIntent ID. That keeps you at the lightest PCI scope (SAQ-A).
- **Never speak a card number, CVV, or full address aloud**, and never log them. If a user tries to dictate a card number, stop them (“please don’t say your card number — use Apple Pay or add it in the wallet”) and do not store the transcript.
- **Fees (US): Stripe 2.9% + $0.30 per successful card charge** — same for Apple Pay as for a card. On a $65 shoe that is ~$2.19.
- Sources: https://docs.stripe.com/payments/mobile ; https://docs.stripe.com/payments/mobile/accept-payment?platform=react-native ; https://comparepsp.com/payment-methods/apple-pay/ ; https://openeducat.org/integrations/stripe/

### Voice-specific safety rules
- **Spending cap per user** (e.g. $150 without extra confirmation, set by the user) and a **per-order explicit confirmation** — standard advice for conversational commerce is a purchase-confirmation control, a payment code / 2FA, and never entering personal/card data where you may be overheard.
- **Biometric, not voiceprint, is the authenticator.** Voice alone is not a secure authenticator (anyone in the room, or a recording, can say “yes”). The wallet’s Face ID / PIN is the real check; the spoken “yes” is the *intent*, not the *authentication*.
- If 3DS2 / the bank asks for approval, the app must hand the user to the bank app / SMS and then **come back and re-read the result** — do not leave a blind user wondering whether the order went through.
- Refunds / cancellations must also be doable by voice (“cancel my last order”) — with the same read-back.
- Sources: https://www.paymentsjournal.com/securing-conversational-commerce-make-interactions-virtual-assistants-safer/amp/ ; https://sider.ai/blog/ai-tools/how-to-use-chatgpt-s-instant-checkout-for-etsy-shopify-without-accidentally-buying-43-throw-pillows

### What this does *not* solve
You still need a seller who will accept the order. Stripe takes the *payment*; it does not place the order on Nike.com for you. For each seller you need either your own store, a retailer checkout API / affiliate checkout, or a handoff to the retailer’s own checkout (where the user may need sighted help or a saved account). Do not present a seller as “buyable in-app” until that route is built and tested.

---

## 8. Scale — 100,000 people at once

### First, define “at once” correctly
100,000 people *with the app open* is not the same as 100,000 people *talking, searching and paying in the same second*. The bills and the ceilings are per **active minute / per request**, not per registered user. A user who is listening to results, thinking, or idle costs almost nothing on the cheap pipeline (wake word + on-device TTS = $0; no server call at all). The numbers below are for **100,000 simultaneous *active* minutes** — the worst case, everyone talking at once — so treat them as a ceiling, not a forecast.

### What runs on the phone (scales automatically) vs what hits a server

| Piece | On the phone — $0, scales free | Hits a server — the bottleneck |
|---|---|---|
| Wake word | Porcupine / openWakeWord, on-device | Nothing (AccessKey check at install only) |
| Speech-to-text | SpeechAnalyzer / ML Kit / Whisper, on-device | Only if you fall back to Deepgram / OpenAI cloud STT |
| Understanding | — (or on-device small model, optional) | Cheap text model (stateless HTTP) |
| Finding products | — | Brave / Serper search API |
| Prices/stock | — | Re-check of the chosen offer |
| Talking back | AVSpeechSynthesizer / Android TTS, on-device | Only if you use cloud TTS or Realtime |
| Buying | Apple Pay / Google Pay sheet (on-device auth) | Stripe PaymentIntent + webhook (per order, not per minute) |
| Live voice session | Nothing — the whole session lives on a server | **Everything, for the whole session: WebSocket/WebRTC connection + Realtime tokens + LiveKit/Pipecat worker** |

That table is the whole scaling story: **the more you push to the phone, the more 100,000 users is a non-event. The more you keep in a live server session, the more it is a hard ceiling.**

### What breaks first — in order

1. **Live voice sessions (Realtime / LiveKit Cloud).** See ceilings below. This breaks *far* before anything else.
2. **Search rate limits.** Brave 50 req/sec = 3,000/min; Serper 50–300 req/sec = 3,000–18,000/min. If 100,000 users all search in the same minute, you need a queue.
3. **LLM requests-per-minute.** Even the cheap text model has an RPM ceiling (see below).
4. **Cloud STT/TTS concurrency and cost.** Per-minute billing, no hard “100k” tier without an enterprise contract.
5. **Checkout.** Stripe is built for this volume per-order; it does not break at 100k *shoppers*, only if 100k people *pay in the same second* — and even then the fix is idempotency keys + a queue, not a bigger server.

### The hard ceilings (sourced, verified live where noted)

**OpenAI — the ceiling that matters most**
- Usage tiers (verified live, https://developers.openai.com/api/docs/guides/rate-limits): **Free $100/month, Build $500/month ($5 in credit purchases), Launch $5,000/month ($100), Grow $200,000/month ($500)**. That $200,000 is an *approved monthly usage limit* set by OpenAI, separate from any hard spend limit you configure yourself. A hard spend limit, when hit, makes requests return `429`.
- **Realtime `gpt-realtime-2.1` / mini, per model (OpenAI model pages): Build 400 RPM / 200,000 TPM; Launch 10,000 RPM / 4,000,000 TPM; Grow 20,000 RPM / 15,000,000 TPM.** Source: https://developers.openai.com/api/docs/models/gpt-realtime-2.1
- **GPT-Live concurrent sessions: Build 50, Launch 300, Grow 500.** Source: https://lexicost.com/voice-agents/vendors/openai (summarising OpenAI model pages)
- **LiveKit Cloud concurrent agent sessions: Build 5, Ship ($50/mo) 20, Scale ($500/mo) from 50, up to 600 on request.** At $0.01 per agent-session minute on top. Sources: https://www.duplexcompute.com/research/livekit-pricing/ ; https://tradeswithai.com/guides/livekit-pricing/
- **Cheap text models (current OpenAI page): Grow — Luna 30,000 RPM / 180,000,000 TPM; Astra/Sol/Terra 15,000 RPM / 40,000,000 TPM.** Source: https://developers.openai.com/api/docs/guides/rate-limits
- **Ramp rule:** once you pass 1M input TPM, OpenAI asks you to increase traffic by no more than 50% every 15 minutes; a sudden spike returns `429 slow_down` even if you are under the headline RPM/TPM. Source: same rate-limits page.
- **Limits are per organisation + per project, not per user.** You cannot “give each user their own limit” — 100,000 users share one org/project ceiling unless you shard across projects/providers.

**Worked ceiling for Realtime (my arithmetic):** a live user burns roughly 1,000–1,800 audio tokens per conversation minute ( ~600 heard + ~1,200 spoken, mixed, plus cached replay). 15,000,000 TPM ÷ 1,000–1,800 ≈ **8,300–15,000 simultaneous Realtime users on Grow** — and that is before RPM, concurrent-session caps (500 on GPT-Live), and cost. **100,000 simultaneous Realtime users on a single OpenAI account is not possible at any price on the standard tiers; it needs Scale/Reserved Tier / enterprise negotiation, multiple providers, or — realistically — not using Realtime for everyone.**

**Worked ceiling for the cheap text model (my arithmetic):** 100,000 users × 1 LLM request/min × ~1,300 tokens = 130M tokens/min — just inside Luna Grow’s 180M TPM, but **100,000 RPM is >3× the 30,000 RPM ceiling**. So even the cheap model fails on *request rate* if everyone asks in the same minute. Fix: spread requests (users do not all ask in the same second), batch, cache the system prompt, and shard across providers/projects.

**Worked ceiling for search (my arithmetic):** 100,000 searches in one minute needs 1,667 req/sec. Brave allows 50, Serper Ultimate 300. So a one-minute burst needs a queue; spread over 10 minutes it is 167 req/sec — still over Brave, inside Serper Ultimate.

### What 100,000 simultaneous active users costs — per minute / per hour (my arithmetic)

Assumptions (stated so they can be checked): 1 active minute = user speaks ~40% of the time, app speaks ~60%; ~800 characters per minute of app speech; 1 search per ~3-minute session; 1 LLM turn per minute; Realtime flagship $0.05–0.11/min realistic cached, mini $0.02–0.05/min, uncached up to $0.30–0.46/min.

| Pipeline (per active user-minute) | Per user / min | 100,000 users / min | 100,000 users / hour |
|---|---|---|---|
| **Cheap, mostly on-device** (on-device STT + TTS $0, cheap LLM ~$0.0003–0.0013/turn, Serper search ~$0.001 amortised) | **~$0.001–0.002** | **~$100–$200** | **~$6,000–$12,000** |
| **Cheap, cloud STT+TTS** (Deepgram $0.0048–0.0077 + OpenAI `tts-1` ~$0.007 + LLM + search) | **~$0.013–0.016** | **~$1,300–$1,600** | **~$78,000–$96,000** |
| **Realtime mini** (`gpt-realtime-2.1-mini`) | **$0.02–0.05** | **$2,000–$5,000** | **$120,000–$300,000** |
| **Realtime flagship** (`gpt-realtime-2.1`, cached, realistic) | **$0.05–0.11** | **$5,000–$11,000** | **$300,000–$660,000** |
| **Realtime flagship, uncached / long-history trap** | **$0.30–0.46** | **$30,000–$46,000** | **$1.8M–$2.8M** |
| **GPT-Live** ($0.05/min session + backend LLM on top) | ~$0.05 + backend | ~$5,000 + backend | ~$300,000 + backend |

Plus, on top of the model bill: LiveKit Cloud $0.01/agent-session-minute = $1,000/min at 100k sessions (if it allowed that many — it does not; max 600 on Scale), and Stripe 2.9% + $0.30 *per completed order only*.

And the monthly cap test: OpenAI Grow’s $200,000/month usage limit buys, at $0.08/min Realtime, **2.5M Realtime minutes a month — 25 minutes per user if you have 100,000 users**. At $0.001/min cheap on-device, the same $200,000 buys **200M minutes**. That is why the cheap pipeline is not a cost optimisation — it is the difference between a product that can exist and one that cannot.

### How to build it so it cannot crash

- **Stateless where it matters:** search, LLM understanding, price re-check and payment creation are stateless HTTP requests. No server holds a user’s session in memory; session state (last results, cart) lives on the phone or in a short-lived store (e.g. Redis, 10-min expiry) keyed by a session ID. Any server can answer any request; add servers horizontally.
- **Stateful only where it must be:** a live voice session *is* stateful (WebSocket/WebRTC + a Pipecat/LiveKit worker per user). That is why you minimise live sessions, cap their number, and put them behind a worker pool that can add more workers — a crash in one worker must kill only that one session, not the service.
- **Caching — where the terms allow it:** cache *popular* search results and product prices for a few minutes on your server to absorb a spike — **but not Brave results** (its terms forbid caching beyond transient storage; see §4). Cache the *parsed* shopping intent and the *spoken* phrasing, not the raw search payload, where that is allowed. Cache LLM system prompts (prompt caching is already priced in: $0.40/1M cached audio tokens vs $32 fresh on Realtime).
- **Per-user caps:** e.g. 30 active voice minutes / 20 searches / $150 spending per user per day, enforced in your API gateway before you call a paid provider. This stops one user (or a bug, or abuse) from burning the monthly budget.
- **Hard monthly spending limits:** set OpenAI’s **hard spend limit** (org + per-project) so over-spend returns `429` instead of a surprise bill, *and* set your own lower internal cap with alerts at 50% / 80% / 95%. Set the same on Deepgram / Serper / Stripe where the provider allows it. The OpenAI Grow *usage* limit ($200,000/month) is not the same as a spend limit you set — configure both.
- **Shed load gracefully — queue or “please wait”, never drop a call:** when you approach a rate limit, do not fail the user. Put search/LLM requests in a short queue with a spoken “One moment — lots of shoppers right now, I’m in a queue” and a position/time estimate; degrade in this order: (1) turn off Realtime for new users, fall back to the cheap pipeline; (2) turn off cloud STT/TTS, fall back to on-device; (3) serve cached / slightly older results and say so; (4) only then, pause new sessions with a polite “please try again in a minute” — never silently drop an in-progress purchase.
- **Failover to a second provider:** for every server piece, have a second provider wired and tested: LLM OpenAI → Anthropic/Gemini; STT Deepgram → OpenAI/AssemblyAI; TTS ElevenLabs → OpenAI/Google; search Serper → Brave. A circuit breaker flips over on repeated `429`/`503` or latency spikes; do not wait for a human to notice. Keep API keys for the backup provider warm (a test call per hour).
- **Back-pressure and retries:** respect `Retry-After` on `429`, exponential back-off with jitter, a hard cap on retries (e.g. 3), and never retry a payment creation without an idempotency key.
- **Load-test the burst, not the average:** test 100,000 *simultaneous* wake-ups (e.g. after a push / an ad), not 100,000 users spread over a day. The burst is what hits RPM/TPM/RPS ceilings.

---

## Recommended setup (short version)

**Default for every user — the cheap pipeline:**
1. **Wake word:** openWakeWord on-device (train “hey app” per launch language); Porcupine only if Enterprise is paid for. App-open only on iOS; foreground service on Android; tap-to-talk on web.
2. **Hear:** Apple SpeechAnalyzer (iOS 26+) / ML Kit (Android) first, **WhisperKit / whisper.cpp (tiny/base) as the on-device fallback for the other languages**, Deepgram Nova-3 cloud only as a last resort.
3. **Understand:** cheap text model (GPT-4o-mini-class, $0.15/$0.60 per 1M) with structured function output; keep the last result list on the phone to resolve “second one / cheaper one”.
4. **Find:** **Serper Shopping** primary ($0.0003–$0.001/search), Brave failover ($0.005/search). Read top 3 aloud, count first.
5. **Verify:** re-check the *chosen* offer’s price + availability at checkout time; re-read any change and re-confirm.
6. **Talk back:** on-device TTS free by default; Pipecat or LiveKit Agents for streaming + Silero VAD + barge-in so it *feels* live; cloud TTS as an upgrade.
7. **Buy:** Stripe Payment Sheet + Apple Pay / Google Pay, PaymentIntent from your server, read-back of total + address + payment method, explicit “yes, buy it”, Face ID as the authenticator, 2.9% + $0.30 per order (US).
8. **Scale:** stateless HTTP for search/LLM/price/payment; on-device for wake/STT/TTS; per-user caps; OpenAI hard spend limit + internal alerts; queue + graceful degradation (Realtime off first); second provider for LLM, STT, TTS and search, with a circuit breaker. **Do not offer unlimited Realtime to all 100,000 users** — cap it (e.g. 5–10 live minutes per user per day, or a premium tier), because the standard OpenAI ceilings stop at ~8,000–15,000 simultaneous Realtime users and 500 concurrent GPT-Live sessions.

**What to build first:** the cheap pipeline end-to-end for English + 2–3 more languages, with the voice checkout safety flow, before adding Realtime, before adding languages 10–50, and before promising 100,000 simultaneous users.

---

## Could not verify / open questions

- **Porcupine at 100,000 users:** published tiers stop at 100 MAU ($6,000/year); Enterprise pricing for 100k MAU is custom and not published. I could not verify a per-user price — ask Picovoice, or use openWakeWord.
- **Serper caching terms:** I verified Brave’s no-caching term; I did not verify Serper’s caching clause from its own terms page. Check it before caching Serper results.
- **Live stock guarantee:** no cheap whole-web API guarantees live stock for every retailer (see §5). Verified only at the chosen-offer level.
- **Exact Realtime token burn per user:** the $0.05–0.11/min figure is a third-party (ForaSoft) calculation from OpenAI’s token rates, not an OpenAI-published per-minute price — OpenAI bills per token. Your actual bill depends on talk-time split, history length and cache hit rate; measure it in a pilot.
- **Model names / prices change fast:** `gpt-4o-mini` is listed for deprecation 14 Jan 2027, `tts-1`/`tts-1-hd` for shutdown 6 Jan 2027, and OpenAI’s tiers changed from five to three (Build/Launch/Grow) on 6 Oct 2026. Re-check every model ID and price at build time; the *price order of magnitude* is the durable part.
- **App Store approval for background wake-word on iOS:** reported as scrutinised / rejected for non-audio-playback use; I could not verify a current, definitive Apple policy statement. Treat “wake word while app is closed on iOS” as not shippable until Apple confirms it for your use case.
- **Deepgram streaming concurrency:** a third-party summary mentioned 150–225 concurrent streaming sockets by plan; I did not verify this on Deepgram’s own limits page, so I have not relied on it above.

## Sources

- Wake word / Porcupine / openWakeWord: https://voxrt.com/wake-word-comparison ; https://outspoken.cloud/blog/best-wake-word-tools ; https://www.exploreai.directory/tools/picovoice ; https://pypi.org/project/openwakeword/0.1.1/ ; https://get.jinn.today/blog/jinn-wake-word-system ; https://www.heyviolet.io/learn/wake-words-and-privacy
- iOS background / Speech limits: https://picovoice.ai/blog/ios-speech-recognition/ ; https://www.signaltrace.wiki/voice-activated-help/TechnicalConstraints/iOS-Background-Audio-Constraints
- Web Speech limits: https://vadimall.com/posts/voice-ai-assistant-browser-typescript-web-speech-api
- STT: https://loronote.com/en/blog/apple-speechanalyzer-vs-whisper ; https://blog.addpipe.com/apple-speechanalyzer-api/ ; https://developers.googleblog.com:443/on-device-speech-recognition-and-text-to-speech-in-google-ai-edge-gallery/ ; https://dodecaidr.pro/en/articles/whisperkit-on-device-transcription/ ; https://www.x-cmd.com/install/whisper.cpp/ ; https://deepgram.com/pricing?ps_partner_key=Y29sb3JtYW5nb2xlZTk4MzU&ps_xid=WliiExMdHTl0bx&gsxid=WliiExMdHTl0bx&gspk=Y29sb3JtYW5nb2xlZTk4MzU
- Cheap LLM: https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/?ref=rojo.me ; https://models.litellm.ai/models/gpt-4o-mini
- Search: https://www.stork.ai/en/brave-search-api ; https://parallel.ai/compare/brave-vs-parallel ; https://cloro.dev/comparisons/brave-search-api-alternatives/ ; https://dev.to/serpkite/serp-api-pricing-in-2026-1000-google-searches-on-10-apis-2ml9 ; https://hasdata.com/blog/best-serp-apis ; https://taskfuel.ai/tools/serper-mcp/
- Shopping / stock: https://glama.ai/mcp/connectors/com.crawlerdata/google-shopping-serp ; https://think.resoneo.com/google-shopping-ai-mode/
- Realtime / Live / pricing / limits (OpenAI pages opened live 2026-11-20): https://developers.openai.com/api/docs/pricing?multimodal-image-pricing=batch ; https://developers.openai.com/api/docs/guides/rate-limits ; https://developers.openai.com/api/docs/models/gpt-realtime-2.1 ; per-minute analysis: https://www.forasoft.com/blog/article/openai-realtime-api-pricing ; https://forasoft.medium.com/openai-realtime-api-production-voice-agents-2026-9d4e861a6dcc ; GPT-Live concurrency: https://lexicost.com/voice-agents/vendors/openai
- TTS: https://www.assemblyai.com/blog/tts-api-pricing ; https://www.tutorialpedia.org/blog/iphone-api-for-text-to-speech-feature/ ; https://frateca.com/blog/best-text-to-speech-engine-for-android/
- Voice frameworks: https://sheerbit.com/pipecat-vs-livekit-agents/ ; https://github.com/sebduffy-prog/sebduffy/blob/HEAD/skills/voice-agents/realtime-voice-agent/SKILL.md ; LiveKit pricing: https://www.duplexcompute.com/research/livekit-pricing/ ; https://tradeswithai.com/guides/livekit-pricing/
- Checkout: https://docs.stripe.com/payments/mobile ; https://docs.stripe.com/payments/mobile/accept-payment?platform=react-native ; https://comparepsp.com/payment-methods/apple-pay/ ; https://openeducat.org/integrations/stripe/ ; https://www.paymentsjournal.com/securing-conversational-commerce-make-interactions-virtual-assistants-safer/amp/
- Per-source notes: notes/source-01-wake-word.md, notes/source-02-stt-tts.md, notes/source-03-search-prices.md, notes/source-04-realtime-llm.md, notes/source-05-checkout-scale.md
