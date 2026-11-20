# AIN Shop — Speech Recognition Scaling Research

**Date read:** 20 November 2026. **Status:** Index + selected official pages verified live (see Sources).
**App in scope:** AIN Shop — voice-only shopping app for blind users, live on iPhone, Android planned, 50 languages claimed.
Today it runs voice conversation through OpenAI Realtime with one API key, a daily spending budget and a limit on simultaneous voice chats.
The question is what happens at 1,000–100,000 simultaneous users, and how to stop speech recognition depending on one key.

## Summary

**Short answer: move speech-to-text (STT) onto the phone. That is the only step that removes the per-minute, per-token and simultaneous-session bottleneck for transcription.**

- **iOS now:** use Apple's **SpeechAnalyzer / SpeechTranscriber (iOS 26+, free, on-device only, no 1-minute cap)** where available, with **SFSpeechRecognizer + `requiresOnDeviceRecognition = true`** as the fallback for older iOS. It is free, but on-device language cover is far below 50 languages.
- **Android:** use **SpeechRecognizer `createOnDeviceSpeechRecognizer()` (API 31+)** or the newer **ML Kit GenAI Speech Recognition (Basic/Advanced, on-device)** where available, with cloud fallback. The default Android `SpeechRecognizer` is *not* reliably on-device — it is likely to stream audio to Google servers.
- **For the languages Apple/Google do not cover on-device (the gap to 50, and to 99):** ship **Whisper via whisper.cpp / WhisperKit (tiny/base/small, 75–466 MB)** as a bundled or lazy-downloaded fallback. It is free (MIT), covers 99 languages, and is more accurate than Vosk's small models, but it is batch/sliding-window, heavier and slower than the native engines. **Vosk** is the lightest true-streaming fallback (∼40 MB/language, Apache 2.0, 20+ languages), but its small-model accuracy is materially worse (English small 9.85% WER on LibriSpeech test-clean, vs Whisper Small 3.74% and Apple SpeechAnalyzer 2.12% in the same-style benchmark — different test sets, see §3).
- **Paid cloud STT is still the accuracy/coverage safety net, not the default:** OpenAI Whisper API **$0.006/min ($0.36/hr)** and Google Cloud Speech-to-Text V2 / Chirp 3 **$0.016/min ($0.96/hr, falling to $0.004/min above 2M min/mo)**. Both are a fraction of a cent to ~1.6 cents per minute — cheap per minute, ruinous only when multiplied by thousands of simultaneous *live* minutes. Use them only when on-device fails / language is missing, and cap them per user.
- **Moving STT on-device does NOT remove the server.** Understanding the request, web/product search and live prices still need a server and a key — but those are short, stateless, cacheable requests, not long-lived voice sessions. That is the whole scaling difference.
- **For product search, do not build on Google Custom Search:** it is **$5/1,000 queries, 100 free/day, capped at 10,000/day, closed to new customers since 20 Jan 2026 and discontinued 1 Jan 2027**. Use **Brave Search API ($5/1,000 = $0.005/search, 50 req/s)** or **Serper ($0.30–$1.00/1,000 = $0.0003–$0.001/search, 2,500 free queries, 50–300 req/s)** — both return clean JSON that can be read aloud. Serper is ~5–17× cheaper than Brave at volume; Brave is an independent index, Serper returns Google results.
- **OpenAI at scale is the binding constraint if you stay on Realtime.** There is no published simultaneous-session cap for the Realtime API itself (OpenAI removed it in Feb 2025), but the **tokens-per-minute (TPM) cap, the monthly usage cap, and cost** are the ceiling. On the top self-serve tier (**Grow: 15,000,000 TPM, $200,000/month** for `gpt-realtime-2.1` / `-mini`), a realistic ceiling is **a few thousand simultaneous active Realtime users** (about 2,500 at ~6,000 tokens/min/user with context replay, up to ~16,000 in the unrealistic no-replay case). **GPT-Live (`gpt-live-1`) is harder-capped: 50 / 300 / 500 concurrent sessions on Build / Launch / Grow.** At $0.06–$0.11/min (flagship Realtime, realistic with caching) or $0.02–$0.05/min (mini), 1,000 simultaneous users cost **$60–$110/min ($3,600–$6,600/hr)** flagship, and 100,000 daily users × 5 min/day would be **~$0.9–$1.65M/month** flagship — far above Grow's $200,000/month cap. Beyond Grow you need Enterprise / Scale Tier / Reserved Tier via sales; there is no infinite self-serve tier.
- **Practical recommendation (§5):** on-device STT first → tiny on-device or server text LLM for intent (e.g. GPT-5 mini, $0.25/1M input, $2/1M output — secondary source, re-check) → Brave/Serper for search → cache prices/products aggressively → keep OpenAI Realtime only as an optional premium/live mode, behind your own server that mints short-lived ephemeral keys, enforces per-user budgets, queues/shedding, and can fall back to the text pipeline. Never ship the master key in the app.

---

## Findings

### 1. Apple Speech framework (SFSpeechRecognizer) on iOS — and its iOS 26 successor

**Free?** Yes. Both `SFSpeechRecognizer` and the new `SpeechAnalyzer` are part of iOS / the Speech framework; Apple charges no per-minute or per-request fee.
Sources: Fora Soft, iOS Speech Recognition SDKs in 2026, https://www.forasoft.com/blog/article/speech-recognition-with-neural-networks-on-ios-1621 — "Apple's SpeechAnalyzer (iOS 26+, free, on-device), SFSpeechRecognizer (iOS 10+, free)"; Picovoice, https://picovoice.ai/blog/ios-speech-recognition/

**On-device or Apple servers? Both — and the default matters.**
- By default `SFSpeechRecognizer` may route audio to Apple servers. Setting `request.requiresOnDeviceRecognition = true` forces local inference, but only if `supportsOnDeviceRecognition` is true for that locale/device; otherwise it requires a network.
- `SpeechAnalyzer` (iOS 26, WWDC 2025) is **on-device only — no server fallback**. Models are system assets managed via `AssetInventory`; nothing is bundled in the app.
Sources: Apple docs as mirrored at https://docs.rs/objc2-speech/latest/x86_64-apple-darwin/objc2_speech/struct.SFSpeechRecognizer.html — "Be prepared to handle failures caused by speech recognition limits. Because speech recognition is a network-based service, limits are enforced so that the service can remain freely available"; "An `SFSpeechRecognitionRequest` can only honor its `requiresOnDeviceRecognition` property if `supportsOnDeviceRecognition` is `true`"; Fora Soft (above); LoroNote, https://loronote.com/en/blog/apple-speechanalyzer-vs-whisper

**Limits / quotas — the important ones:**
- **1 minute per recognition request (server path, and the classic SFSpeechRecognizer cap).** Apple docs: "the framework stops speech recognition tasks that last longer than one minute." Workaround is to re-arm/restart before ~55 s. On-device path is described in secondary sources as avoiding this cap, but one research note flags it as *unconfirmed* whether the 1-min / 1,000-per-hour limits apply to `requiresOnDeviceRecognition = true` requests or only to the server path — treat on-device as uncapped only after testing on device.
- **1,000 requests per device per hour** (device-wide, shared with every other app, not per-app) — cited from Apple Technical Q&A QA1951 via Picovoice, https://picovoice.ai/blog/ios-speech-recognition/ and via https://github.com/cinimody/dosbts/blob/HEAD/docs/plans/2026-08-09-voice-v1-design-options.md . Apple also says more generally "individual devices may be limited in the number of recognitions that can be performed per day" (ThinkScribe summary, https://thinkscribe.ai/en/blog/offline-speech-to-text-iphone-how-it-works).
- **SpeechAnalyzer removes the duration cap** (long-form, "transcribe a 90-minute lecture in one go"), but **requires iOS 26+** and is not backward compatible. It also has **no automatic language detection** — one transcriber per locale — and, in some 2026 summaries, no custom-vocabulary support yet (other summaries say `AnalysisContext.contextualStrings` biases it; do not rely on this until tested — see Could not verify).
- **Permissions:** `NSSpeechRecognitionUsageDescription` in Info.plist + microphone permission — a second prompt.

**Languages:**
- Server path: **50+ languages**.
- On-device (iOS 13-era list): **10+ languages** — English (US/CA/GB/IN), Spanish (US/MX/ES), Italian, Brazilian Portuguese, Russian, Turkish, Chinese (Mandarin/Cantonese). Later summaries say "roughly 60 supported on-device" but quality drops outside English/Spanish/Mandarin — that figure is not from Apple and conflicts with the older list; treat as unverified.
- **SpeechTranscriber (iOS 26): 42 locales covering 22 languages** as of Aug 2026: Arabic, Chinese (Simplified/Traditional/Hong Kong), Cantonese, Danish, Dutch, English (9 variants), Finnish, French, German, Hebrew, Italian, Japanese, Korean, Malay, Norwegian Bokmål, Portuguese, Russian, Spanish, Swedish, Thai, Turkish, Vietnamese. **Missing, notably: Hindi, Polish, Czech, Greek, Ukrainian, Indonesian.** Source: LoroNote, https://loronote.com/en/blog/apple-speechanalyzer-vs-whisper ; also https://swiftcrafted.dev/article/speechanalyzer-speechtranscriber-ios-26-swift

**Accuracy:**
- No accuracy numbers published by Apple for SpeechAnalyzer.
- One independent benchmark (July 2026, LibriSpeech, on an M2 Pro Mac — **not an iPhone, clean read English**): **SpeechAnalyzer 2.12% WER test-clean / 4.56% test-other; Whisper Small 3.74% / 7.95%; Whisper Base 5.42% / 12.51%; Whisper Tiny 7.88% / 17.04%; legacy SFSpeechRecognizer 9.02% / 16.25%.** Source: https://rohitraj.tech/notes/apple-speechanalyzer-vs-whisper-on-device-stt-2026 and LoroNote (above). A second, harder real-world test (FLEURS, 25 languages) found Apple winning German/Italian but Whisper winning English/Spanish, and Apple unsupported in most of the 25 languages — see §3.
- Older on-device SFSpeechRecognizer is described as "Good" vs server "Best" (WWDC 2019, via https://manuals.plus/video/f12322447f8561aa50708b8404518710512922649fb6e47b672e62410e82a78c).

**Offline?** Yes, on-device path works offline **once the language model is downloaded** (system-managed). It may not be available immediately after install; check `supportsOnDeviceRecognition` / `SpeechTranscriber.isAvailable` / `installedLocales` at runtime and degrade gracefully.

**Good enough for a voice shopping app?** **Yes, for short commands and product names in the ~22 covered languages, on iOS 26+ — with three conditions:** (1) restart/re-arm around the 1-minute cap on the old API, or use SpeechAnalyzer; (2) feed product/brand names as `contextualStrings` / a custom language model (`SFSpeechRecognitionRequest.contextualStrings`, `SFCustomLanguageModelData`) to bias recognition toward your catalogue — this is the main lever for proper nouns, which generic STT mangles; (3) accept a cloud fallback (or Whisper, §3) for the other ~28 of the claimed 50 languages, for noisy audio, and for accented/code-switched speech, where cloud/Whisper still wins. It is *not* good enough as a sole engine for all 50 languages.

### 2. Android SpeechRecognizer

**Free?** Yes — the platform API itself is free; there is no per-minute charge from Google for using it. The cost is dependence on Google's service / device, not money.

**On-device or Google servers? Default is cloud.**
- Android docs: "The implementation of this API is likely to stream audio to remote servers to perform speech recognition. As such this API is not intended to be used for continuous recognition, which would consume a significant amount of battery and bandwidth." Source: https://developer.android.com/reference/android/speech/SpeechRecognizer (also Kotlin page https://developer.android.com/reference/kotlin/android/speech/SpeechRecognizer)
- **On-device path (API 31+, Android 12+):** `SpeechRecognizer.createOnDeviceSpeechRecognizer()` + `isOnDeviceRecognitionAvailable()` + `checkRecognitionSupport()`. It throws `UnsupportedOperationException` when unavailable — always check first. `triggerModelDownload` is API 33/34. Older hint: `RecognizerIntent.EXTRA_PREFER_OFFLINE` (API 23+) is only a preference, not a guarantee.
- **ML Kit GenAI Speech Recognition (newer, recommended for new Android work):** on-device via AICore / Gemini Nano. Verified live 20 Nov 2026: https://developers.google.com/ml-kit/genai/speech-recognition/android — "Basic: traditional on-device model, similar to the SpeechRecognizer API… Advanced: GenAI model, broader language coverage and better overall quality. You don't have to download a separate language pack for each language." Last updated 2026-11-14 UTC on that page. **Still alpha** (1.0.0-alpha2, Oct 2026) — do not treat as stable production API yet.
  - Basic: API 31+, locales en-US, fr-FR, it-IT, de-DE, es-ES, hi-IN, ja-JP, pt-BR, tr-TR, pl-PL, cmn-Hans-CN, ko-KR, cmn-Hant-TW, ru-RU, vi-VN (most beta).
  - Advanced: **Pixel 10/11 only** (plus newer Gemini Nano chipsets incl. Galaxy S26/Z Flip8/Z Fold8 per the Nov 2026 docs update), locales incl. ar-SA, da-DK, nl-NL, sv-SE, th-TH, id-ID, pt-PT etc. (many beta).
  - Google Developers Blog, 10 Nov 2026, https://developers.googleblog.com:443/on-device-speech-recognition-and-text-to-speech-in-google-ai-edge-gallery/ — ML Kit on-device ASR: **100+ languages, 8–9% WER on FLEURS, ~10× real-time, 0 MB added to APK** (models served through AICore / system speech services). That 100+ figure is for the newest system models, not for the older platform SpeechRecognizer — do not conflate them.

**Offline language packs:**
- Offline recognition relies on Google's "Speech Recognition and Synthesis" system app + downloaded language packs. Historically finicky; `ERROR_LANGUAGE_UNAVAILABLE` = supported but not downloaded yet; `ERROR_LANGUAGE_NOT_SUPPORTED` = not available. One field report notes Google limits consumer devices to **four simultaneous offline language packs** — secondary source, unverified against Google docs (Medium, https://medium.com/@firlejczyk/how-we-built-an-offline-zero-latency-p2p-voice-translator-for-industrial-handsets-5e6299e753fb). Some OEM / rugged devices ship a different speech service (e.g. Qualcomm) that blocks the local engine — test on real devices, not just Pixel.
- On-device availability varies by vendor, Android version and whether Google services are present. Phones without Google Mobile Services may have no recognizer at all — check `isRecognitionAvailable()`.

**Limits:**
- No published per-day quota like Apple's 1,000/hr is documented for Android in the sources found. Practical limits are: **one utterance at a time** (it stops after each utterance / pause — not continuous dictation without re-arming), **battery/bandwidth** if cloud, **model-download state**, and **device fragmentation**.
- Cloud path: **120+ languages/dialects** claimed (secondary, https://voice.ai/hub/ai-voice-agents/android-speech-to-text-api/), accuracy "varies dramatically", on-device only "a dozen languages" with "accuracy drops of 30–40% for regional dialects or technical terminology" in that vendor's summary — treat the percentages as vendor opinion, not a benchmark.

**Accuracy / suitability for voice shopping:** **Yes as the default Android engine, with the same caveats as iOS:** good for short commands in major languages, weaker on proper nouns / product names without vocabulary biasing, weaker on low-end / non-Google devices, and incomplete for 50 languages on-device. For a blind-user shopping app, the failure mode matters more than the average: a mis-heard product name is a wrong purchase, so always confirm ("Did you mean…?") by voice, and keep a cloud/Whisper fallback for low-confidence results. Do not rely on `createOnDeviceSpeechRecognizer()` alone — it bypasses third-party RecognitionServices and fails with `ERROR_CLIENT / LANGUAGE_PACK_ERROR` if the pack is missing (GitHub issue, https://github.com/santawho/oeffi-ng/issues/64).

### 3. Other free / cheap on-device options

| Option | Cost / licence | Size | Languages | Accuracy (note test set) | Runs on phone? | Streaming? |
|---|---|---|---|---|---|---|
| **Vosk** (Alpha Cephei, Kaldi) | Free, Apache 2.0 (some models other licences) | Small ~40–50 MB/language; large 1–2 GB (server only) | 20+ languages, 35 small models / 30 languages listed | Small en-US **9.85% WER LibriSpeech test-clean, 10.38% TED-LIUM**; large en-US 5.69%/6.05%. Small French 23.95% Common Voice / 19.30% MTEDX; small Chinese 23.54% SpeechIO-02. Much worse on non-English small models. | Yes — Android, iOS, Raspberry Pi | **Yes, true streaming, near-zero latency** |
| **whisper.cpp / WhisperKit** (OpenAI Whisper weights, MIT) | Free, MIT (code + weights) | tiny 75 MB, base 142 MB, small 466 MB, medium 1.5 GB, large 2.9+ GB; quantized large-v3-turbo ~547 MB (Q5_0) | **99 languages** (multilingual models) | Tiny 7.88% / Base 5.42% / Small 3.74% LibriSpeech test-clean (same benchmark as §1); Large v3 ~2.0–2.5% test-clean in published evaluations (separate evals, not same run). Best on-device accuracy per MB at small+ sizes. | Yes — iOS (whisper.objc / WhisperKit, Neural Engine), Android, WASM | **Not native** — batch model on 30-s windows; streaming via sliding-window example, higher first-partial latency, accuracy degrades on short chunks |
| **Apple SpeechAnalyzer** | Free, iOS system | 0 MB in app (system asset) | 22 languages (§1) | 2.12% test-clean (see §1) | iOS 26+ only | Yes |
| **Android ML Kit GenAI** | Free, system (AICore) | 0 MB in APK | Basic 15 locales; Advanced 21 locales; newest system models 100+ (blog) | 8–9% WER FLEURS (Google blog, newest models) | Android, API 31+ Basic; Advanced Pixel 10/11+ | Yes, partial + final |
| **Sherpa-onnx / Parakeet-TDT 0.6B, Moonshine** | Free/open-weight | ~40 MB int8 to ~340 MB | Multi-language (Parakeet 25 European languages in one test) | Parakeet v3 beat Whisper large-v3-turbo in 15/25 languages on FLEURS in one independent test (e.g. English 4.5% vs 3.9% Whisper; Italian 2.5% vs 2.7%) — https://dev.to/yapapp/parakeet-v3-vs-whisper-vs-apples-on-device-model-in-25-languages-every-transcript-published-3bjo | Yes — iOS/Android via MediaPipe/LiteRT | Streaming designs exist |

Sources: Vosk official models, https://alphacephei.com/vosk/models.html ; Vosk overview, https://whipscribe.com/tools/vosk and https://bestllmfor.com/guide/vosk-reconnaissance-vocale-hors-ligne/ ; whisper.cpp comparison, https://dev.to/voxrtio/on-device-streaming-asr-in-2026-five-approaches-and-when-to-pick-what-5h1n#comments and https://www.x-cmd.com/install/whisper.cpp/ ; Whisper model sizes, https://solutions.georgy.dev/runtime-speech-recognizer

**Practical reading for AIN Shop:**
- **Vosk is the right *fallback* for commands, not for free-form product search in 50 languages.** Its small models are tiny and truly streaming, it supports custom grammars/vocabulary (good for "buy / search / checkout / repeat" + a product list), and it works on old phones. But 10–25%+ WER on many non-English small models means it will mis-hear brand/product names often. Only use large Vosk models on a server, not on a phone.
- **Whisper (tiny/base) is the right *coverage* fallback.** One multilingual model covers all 50 languages without downloading 50 packs. Cost is download size (75–150 MB for tiny/base), RAM/battery, and latency: it is not a streaming recogniser, so for a conversational app use it per-utterance (record → transcribe → respond) rather than live partials, or use WhisperKit's streaming wrapper and accept the delay. On modern iPhones WhisperKit runs on the Neural Engine at 2–8% WER, sub-200 ms latency per Fora Soft — that latency figure is for short utterances, not continuous conversation.
- **Do not bundle 50 Vosk models** (50 × ~40 MB = ~2 GB). Download on demand, one language at a time, on Wi-Fi, with the user's chosen language only.

### 4. Paid cloud STT vs free on-device — comparison (added per follow-up)

|  | Free on-device (Apple / Android native) | OpenAI Whisper API (cloud) | Google Cloud Speech-to-Text V2 / Chirp 3 (cloud) |
|---|---|---|---|
| **Price** | **$0** per minute | **$0.006/min ($0.36/hr)** — `whisper-1`. **Deprecated: removed 26 Feb 2027**; replacement `gpt-transcribe` **$0.0045/min**, `gpt-live-transcribe` **$0.017/min** (live) | **$0.016/min ($0.96/hr)** standard, first 500k min/mo; **$0.010** to 1M, **$0.008** to 2M, **$0.004** above 2M; **dynamic batch $0.003/min**. V1: 60 min/mo free, then $0.016/min with data logging / $0.024 without. Billed per 15 s (V1) / per-minute tiers (V2) — re-check rounding on the pricing page before budgeting. |
| **Languages** | Apple on-device 22 (SpeechAnalyzer) / ~10+ (old SFS); Android on-device ~12–15 (Basic) / 100+ newest system models only | **99 languages** | **125+ languages/dialects** (Chirp 3: 85+ languages/variants on the product page; 100+ locales in V2 comparisons) |
| **Accuracy advantage** | Best on clean major-language English in Apple's new engine (2.12% WER, §1); otherwise good, not best. Weak on accents, noise, code-switching, rare proper nouns. | Large-v3: ~3–5% WER clean English, ~8–12% noisy; strong multilingual, incl. low-resource languages. Better than Vosk small and old SFS by a wide margin; about par with Apple SpeechAnalyzer on clean English. | Chirp 3: **4.3% WER** in Artificial Analysis table via AssemblyAI (Nov 2026); Chirp 2 ~3–4% clean / 7–10% noisy in a 2026 comparison. Slight edge on noisy/telephone audio; diarization + auto language detection built in. |
| **Latency / features** | ~100–300 ms partials, offline, private (audio never leaves phone on-device) | File/batch API (not live streaming in `whisper-1`); timestamps, translation to English. Rate limits: Free 3 RPM / 200 RPD; Build 2,500 RPM; Launch 7,500; Grow 10,000. | Streaming + batch, diarization, model adaptation, auto language detection, enterprise SLA / data residency (V2) |
| **Scaling / failure mode** | Scales with users for free — each phone does its own work. Fails per-device (missing pack, old OS, unsupported language). | Scales with your bill + RPM/TPM. One key, one org limit. Fails with 429 / quota. | Same — scales with bill + GCP quota. Fails with quota / cost. |
| **When to pay** | Default for every utterance | When on-device confidence is low, language missing, or audio noisy — and only for that utterance | Same, esp. if already on GCP, need diarization / 125 languages / enterprise compliance |

Sources — Whisper price (verified live 20 Nov 2026): https://developers.openai.com/api/docs/models/whisper-1 — "$0.006 / Cost / minute", "Deprecated", rate limits table Free 3 RPM/200 RPD, Build 2,500, Launch 7,500, Grow 10,000. Deprecation/replacement: https://www.cartesia.ai/learn/openai-whisper-api-pricing and https://saynota.com/blog/openai-transcription-cost-per-hour — whisper-1 deprecated 26 Aug 2026, removed 26 Feb 2027, replacement `gpt-transcribe` ($0.0045/min) or `gpt-live-transcribe` ($0.017/min).
Google price (official): https://cloud.google.com/speech-to-text?hl=en — V2 $0.016/min, Chirp 3 85+ languages; pricing table https://cloud.google.com/speech-to-text/priv/pricing — V1 $0.024/min above 60 free min. Volume tiers / dynamic batch: https://www.assemblyai.com/blog/google-cloud-speech-to-text-alternatives (prices checked 17 Nov 2026) and https://www.speechmatics.com/how-we-compare/google-alternative
Accuracy comparisons (different test sets — do not compare as if one benchmark): https://dev.to/zephyr_zheng_0bfed478de52/whisper-vs-google-stt-vs-deepgram-2026-comparison-56e0 ; https://www.edenai.co/post/apple-speechanalyzer-vs-cloud-stt-benchmarks-and-costs

**Cost intuition (arithmetic from the listed rates, not a vendor quote):** 1,000 users × 1 minute of speech each = $6.00 on Whisper API, $16.00 on Google Chirp. That is trivial. 100,000 users × 5 min/day × 30 days = 15,000,000 minutes/month = **$90,000/mo Whisper, $240,000/mo Google Chirp at list ($60,000 at the $0.004 volume tier)**. Cloud STT only becomes the problem at *live, simultaneous, all-day* volume — which is exactly what Realtime (§4b) does, because it bills for listening + speaking + context replay, not just transcription.

### 4b. Scaling — what still needs a server, what breaks first, OpenAI at scale

**If STT moves on-device, what still needs a server / API key?**
1. **Understanding the request (NLU / intent + slots).** "Find black running shoes under $80 in size 10" is not transcription — it is parsing intent, entities, price/size filters, and deciding the next action. That can be (a) a tiny on-device model / rules + catalogue matching for the common commands ("search X", "buy", "checkout", "repeat", "cheaper"), or (b) a cheap text LLM on your server. It does not need a voice model. Text LLM cost is orders of magnitude below voice: e.g. GPT-5 mini $0.25/1M input + $2/1M output (secondary sources checked 18 Nov 2026: https://broadrouter.com/llm-api-pricing/gpt-5-mini/ , https://neurogenesys.ai/tools/llm-pricing/gpt-5-mini — **re-check on OpenAI's pricing page before budgeting**). A typical turn (2,000 input tokens incl. catalogue context + 200 output) is ~$0.0009. 1M such turns = ~$900.
2. **Searching the web / products and reading prices.** A phone cannot reliably search the whole web, fetch retailer pages, compare prices, or keep a product catalogue fresh. That needs a server with a search API and/or retailer/affiliate APIs, plus caching. Prices change; a cached price read aloud that is wrong is worse than a slow one — cache with a TTL and re-check at checkout.
3. **Speaking the answer aloud (TTS).** Can stay on-device and free: iOS `AVSpeechSynthesizer`, Android TextToSpeech. Cloud TTS (OpenAI / Google / ElevenLabs) is only needed for a more natural voice.
4. **Checkout, payment, account, order history, recommendations, abuse/fraud control.** All server-side, all need keys — but they are ordinary web requests, not voice sessions.
5. **The key itself.** Even on-device STT does not remove *all* keys: the server still holds the LLM key and the search key. The difference is those keys are used for **short, stateless requests that can be cached, queued, rate-limited per user, rotated, and failed over to a second provider**. A Realtime voice session cannot be cached or queued — it is a live socket that must stay up.

**How other voice apps handle 1,000–100,000 simultaneous users — what breaks first:**
- **Voice AI is stateful and real-time, unlike a website.** Each call is a long-lived bidirectional stream that must stay on one session/server; you cannot load-balance individual requests. Sources: https://www.autointerviewai.com/blog/deploy-scale-voice-ai-agents-cloud-production-2026 (decoupled pools: WebRTC/SIP gateways CPU/network-bound, STT/TTS GPU/VRAM-bound, LLM token-streaming; HPA on active RTP sockets / GPU use, not just CPU) and https://callsphere.ai/blog/vw3c-capacity-planning-voice-ai-concurrent-calls (three things break: **(1) WebSocket layer — FDs/process, ulimits, TCP backlogs; (2) Model TPM — OpenAI tokens-per-minute; (3) GPU memory — each session pins KV cache/audio buffers**).
- **At 1,000 concurrent calls (one vendor's reference matrix, not a universal law):** ~12 WebRTC gateway nodes, 16 STT pods (GPUs), 24 LLM orchestrator pods, 12 TTS workers — AutoInterviewAI (above). Treat as an order-of-magnitude illustration, not a prescription.
- **What breaks first for AIN Shop specifically:** in the current Realtime design, **OpenAI TPM + monthly cap, then cost, then your own gateway**. In the on-device-STT design, **your text-LLM/search tier breaks first** — but that tier is stateless, so it scales by adding replicas behind a load balancer, and you can shed load gracefully (queue, "please wait", text fallback) instead of dropping a live voice call mid-sentence.
- **Architectures / pricing models used at scale:** (a) **stateless text pipeline** (phone STT → HTTPS POST text → LLM → search → TTS on phone) — cheapest, scales like a website; (b) **managed voice-agent platforms** (Retell, Bland, Synthflow, Deepgram Voice Agent, ElevenLabs) — charge ~$0.05–$0.08/min on top of model cost, handle gateways/scaling for you, but you still pay per live minute and still hit their concurrency plan caps (e.g. Synthflow starter 5 concurrent, cited in CallSphere); (c) **self-hosted GPU STT/TTS + LLM** — crossover around ~2,500 sustained concurrent users in one operator's math (CallSphere: "API for <1k concurrent. GPU when reserved capacity becomes cheaper… cross-over around 2.5k sustained concurrent") — only worth it if you have steady, predictable volume; (d) **OpenAI Enterprise / Scale Tier** — buy TPM upfront (see §4c).

**Web search for products — Brave / Serper / Google Custom Search (added per follow-up):**

| Search API | Price | Free | Rate / cap | What you get | Verdict for AIN Shop |
|---|---|---|---|---|---|
| **Brave Search API** | **$5/1,000 requests = $0.005/search**; Answers $4/1,000 + $5/1M in/out tokens | $5 credit/mo (~1,000 searches) | **50 req/s** (Search) | Own independent index; Web/News/Video/Image/Place + LLM Context; clean JSON | Solid, simple, predictable. 100k searches/mo = **$500**. 1M = **$5,000**. |
| **Serper** (Google SERP API) | **$1.00/1,000 at $50 pack (50k), $0.75 at $375 (500k), $0.50 at $1,250 (2.5M), $0.30 at $3,750 (12.5M)** = $0.001–$0.0003/search | **2,500 queries, no card** | **50–300 req/s** by pack | Google results as clean JSON (web/images/news/maps/places/videos/shopping/scholar/autocomplete), 1–2 s, 1 credit per ≤10 results, 2 credits for 11–100 | **Cheapest for Google results.** 100k/mo = **$75–$100**. 1M/mo = **$500–$750** (or $300 if you can burn 12.5M credits in 6 mo). **Credits expire after 6 months** — do not over-buy. |
| **Google Custom Search JSON API** | **$5/1,000, 100 free/day** | 100/day | **10,000 queries/day hard cap** | Google Programmable Search Engine results, title/link/snippet only | **Do not build on this.** Closed to new customers 20 Jan 2026, **discontinued 1 Jan 2027**. Same $5/1,000 as Brave but capped and ending. Google's replacement is Vertex AI / Agent Search (Enterprise $4/1,000, up to 50 domains — for searching *your own* sites, not the web). |

Sources: Brave pricing (official) https://api-dashboard.search.brave.com/documentation/pricing ; Serper pricing via https://coldiq.com/blog/serper-pricing (verified 5 Jul 2026) and https://dev.to/kevin_menesesgonzlez/7-best-serp-apis-in-2026-price-per-1000-searches-compared-441a (checked 4 Nov 2026) and https://dev.to/serpkite/serp-api-pricing-in-2026-1000-google-searches-on-10-apis-2ml9 ; Google Custom Search (official) https://developers.google.com/custom-search/v1/overview — "not available for new customers… until the service discontinuation on January 1, 2027… $5 per 1000 queries, up to 10k queries per day" and https://dev.to/serpkite/cheaper-alternatives-to-the-google-search-api-in-2026-4kh2
**Why this matters for a voice app for blind users:** a search API returns *structured* results (title, link, snippet, price if in the snippet/shopping vertical) that your server can turn into one clean spoken sentence ("Nike Pegasus, $89 at…"). Scraping retailer HTML yourself is brittle, slower, and risks being blocked; a SERP API is the cheap, legal, read-aloud-friendly layer. Still verify the price on the retailer's page/API at checkout — a snippet price can be stale.

### 4c. OpenAI at scale — tiers, raising limits, practical ceiling (added per follow-up)

**Tier system (current, verified live 20 Nov 2026 on OpenAI's rate-limits page):**
OpenAI's rate-limits guide, https://developers.openai.com/api/docs/guides/rate-limits — "Rate limits are defined at the organization level and at the project level, not user level" and "OpenAI sets an approved monthly usage limit for each organization. This is separate from the spend limits that you can configure."

| Tier | Qualification (total credit purchases) | OpenAI monthly usage limit (their cap, not yours) |
|---|---|---|
| Free | Allowed geography | $100/month |
| **Build** | $5 | $500/month |
| **Launch** | $100 | $5,000/month |
| **Grow** (top self-serve) | $500 | **$200,000/month** |

Source: same page, table reproduced verbatim. On 6 Oct 2026 OpenAI consolidated five numbered tiers (Tier 1–5) into these three named tiers; Grow now needs $500 in purchases instead of the old Tier 5's $1,000 (https://www.layer3labs.io/guides/openai-api-usage-tiers).

**How to raise limits / set a budget — dashboard path:**
- **View / upgrade tier:** "To view the limits for each model at your usage tier, go to **Settings > Organization > Limits** and review **Rate limits**. To upgrade your usage tier, select **Upgrade tier** in the **Usage Tiers** section." (OpenAI rate-limits page, above.) In the current system the upgrade is **largely automatic once cumulative credit purchases reach the threshold** — there is no separate "please raise me" form in the current docs for the standard tiers. The user prompt's advice — *go to Settings, then Billing, set a monthly budget; under Limits request a higher tier; they usually approve once your account has history* — matches the older Tier 1–5 era (where higher tiers also required 7/14/30 days of history) and the general practice of building spend history before asking sales/support for more. Practical advice: buy credits gradually, run real traffic, keep the account in good standing, and use the **Upgrade tier** control; if it does not move, contact support/sales with your use case and traffic forecast.
- **Set a monthly budget (your own cap, separate from OpenAI's tier cap):** Settings → Organization → Limits → **Edit spend limit** → enter a Monthly spend limit → optionally turn on **"Enforce a hard limit"**. Without that toggle it is only an alert — traffic continues. With it, requests return **429 `organization_spend_limit_exceeded` / `project_spend_limit_exceeded`**. OpenAI warns enforcement "is not instantaneous, so recorded spend can slightly exceed the configured amount" and "Hard spend limits can interrupt production traffic." Also set **spend alerts** at e.g. 75%/90% so you are warned before the hard cap hits. Project-level limits: Project settings → Limits → Spend. Sources: OpenAI rate-limits page § Spend limits (above); community answer https://community.openai.com/t/how-to-set-organization-usage-limits/1332014/8 ("go to…/settings/organization/limits and click on 'Edit Budget'"); https://www.rho.co/blog/llm-api-spending-limits ; https://gptmigrator.com/openai-api-key-and-spend-limits-for-a-bot/
  - Note on navigation: the user prompt says "Settings, then Billing". The current docs put the spend limit under **Settings > Organization > Limits** (and Billing → Overview for payment/credits). UI labels move — if Billing does not show it, use Organization → Limits.
- **Do not confuse the two caps:** (a) OpenAI's monthly *usage* limit by tier ($500/$5,000/$200,000) — OpenAI sets it; (b) *your* monthly *spend* limit — you set it, and it should be ≤ your real budget. A hard spend limit that is too low will take the app down; no hard limit at all risks a runaway bill.

**Per-model limits that matter for voice (verified live):**
- `gpt-realtime-2.1` and `gpt-realtime-2.1-mini`: **Build 400 RPM / 200,000 TPM; Launch 10,000 RPM / 4,000,000 TPM; Grow 20,000 RPM / 15,000,000 TPM.** Free: not supported. Source: https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini (opened live 20 Nov 2026) and Lexicost summary https://lexicost.com/voice-agents/vendors/openai for the flagship (same numbers).
- `gpt-live-1` (GPT-Live, separate Live API): **concurrent sessions, not TPM — Build 50, Launch 300, Grow 500; Free not supported. $0.05 per session minute, billed per second, plus backend model.** Sources: https://www.forasoft.com/blog/article/openai-realtime-api-pricing ; https://www.retellai.com/blog/best-speech-to-speech-ai-apis-phone-calls
- **Realtime API itself: no published simultaneous-session cap.** OpenAI, https://openai.com/index/introducing-the-realtime-api/ — "Update on February 3, 2025: We no longer limit the number of simultaneous sessions on the Realtime API. Please refer to our docs for the latest rate limits." The cap is therefore TPM/RPM + money, not a session count.
- **Ramp / burst limit:** even *within* TPM, OpenAI returns **429 `slow_down`** if traffic rises too fast, and **503 `server_is_overloaded`** if the model is overloaded. "As a rule of thumb, once your traffic reaches 1 million input tokens per minute (TPM), increase it by no more than 50% every 15 minutes." Source: rate-limits page, § Handle rapid traffic increases. A viral spike can therefore 429 even on Grow.
- **Beyond Grow:** **Scale Tier** (Enterprise, models before GPT-5.6) — buy token units upfront, min. 30 days, 99.9% uptime SLA, quota added to rate limits; **Reserved Tier** for GPT-5.6+. Source: https://openai.com/api-scale-tier/ and rate-limits page. That is a sales conversation, not a dashboard toggle.

**Realtime pricing (for the cost math):**
- `gpt-realtime-2.1`: audio **$32/1M input tokens, $64/1M output, $0.40 cached input**; text $4 in / $24 out. Mini: **$10 / $20 / $0.30**; text $0.60 / $2.40. Audio: 1 min user speech ≈ 600 tokens; 1 min assistant speech ≈ 1,200 tokens. So a minute heard ≈ $0.019 flagship / $0.006 mini; a minute spoken ≈ $0.077 / $0.024. **Realistic two-way minute, with caching: $0.06–$0.11/min flagship, $0.02–$0.05/min mini; uncached / long-context can hit ~$0.46/min.** Sources: Fora Soft pricing guide https://www.forasoft.com/blog/article/openai-realtime-api-pricing (re-checked 8 Nov 2026) and https://www.layer3labs.io/guides/openai-realtime-api-pricing
- **GPT-Live:** $0.05/min + backend model tokens.

**Practical ceiling — worked arithmetic (labelled as arithmetic, using the rates above):**
- Per active Realtime user, token burn is roughly **900 tokens/min** in the best case (30 s user + 30 s assistant, no context replay) and **~6,000 tokens/min** in a full-duplex + context-replay case (the figure used by CallSphere: 20M TPM ÷ 6,000 ≈ 3,300 concurrent). Use that range, not a single number.
- **Grow 15M TPM ÷ 900 ≈ 16,600** simultaneous (unrealistic ceiling) ; **÷ 6,000 ≈ 2,500** simultaneous (realistic ceiling). So: **a few thousand simultaneous active Realtime users on Grow, not tens of thousands.**
- **Build 200k TPM ÷ 6,000 ≈ 33** simultaneous; **Launch 4M ÷ 6,000 ≈ 666** simultaneous. A new account on Build will 429 with a few dozen live users.
- **Monthly cap binds before TPM at high volume:** Grow $200,000/mo ÷ $0.08/min (mid flagship) ≈ **2.5M Realtime minutes/month**. That is 1,000 users × ~83 min/month each, or 100,000 users × <1 min/month each.
- **Cost at the mission's scale (same arithmetic):**
  - 1,000 simultaneous users, all in a live minute: flagship **$60–$110/min ($3,600–$6,600/hr)**; mini **$20–$50/min ($1,200–$3,000/hr)**.
  - 1,000 daily users × 5 min/day = 150k min/mo: flagship **$9,000–$16,500/mo**; mini **$3,000–$7,500/mo**. Fits Grow, exceeds Launch ($5,000 cap).
  - 100,000 daily users × 5 min/day = 15M min/mo: flagship **$900,000–$1,650,000/mo**; mini **$300,000–$750,000/mo**. Far above Grow's $200,000 cap — you would need Enterprise/Scale Tier pricing and a different architecture (or you would be throttled / cut off).
  - GPT-Live at 100,000 simultaneous would be impossible on self-serve: hard cap **500 concurrent sessions on Grow**.
- **The single-key worry, precisely:** the key is not "consumed" and there is no per-key session count in Realtime, but **limits are per organisation/project, not per key** — so adding more keys does *not* raise the ceiling. Multiple keys do not help; only a higher tier, Scale/Reserved Tier, Azure OpenAI as a second pool, or a second provider does. Source: rate-limits page ("defined at the organization level and at the project level, not user level") and community discussion https://community.openai.com/t/maximum-number-of-parallel-real-time-sessions-on-a-single-openai-api-key/1362278
- **Ephemeral keys are for security, not scale:** mint a short-lived client secret from your server (`POST /v1/realtime/client_secrets`, 10–7,200 s, default 600 s) and hand *that* to the phone for WebRTC. The master key never leaves your server. That stops a leaked key from draining the account, but the ephemeral sessions still count against the same org TPM/monthly cap.

### 5. Practical recommendation

**Best setup for AIN Shop — so STT does not depend on one key and does not break as users grow:**

**On the phone (free, no key, scales with users):**
1. **STT first, on-device, in this order per utterance:** (a) iOS 26+: SpeechAnalyzer/SpeechTranscriber; older iOS: SFSpeechRecognizer `requiresOnDeviceRecognition = true`. (b) Android: ML Kit GenAI (Basic, then Advanced where available) or `createOnDeviceSpeechRecognizer()`. (c) If the locale is unsupported or confidence is low: **Whisper tiny/base via WhisperKit / whisper.cpp** (one download, 75–142 MB, 99 languages). (d) Vosk small model only for fixed commands / as a last resort on very old phones.
2. **Check capability at runtime, every session** (`supportsOnDeviceRecognition`, `SpeechTranscriber.isAvailable`, `isOnDeviceRecognitionAvailable()`, `checkRecognitionSupport()`), download the language model on Wi-Fi before first use, and tell the user by voice if a language is not available offline — do not silently fall back to a server.
3. **Bias the recogniser toward shopping:** pass product/brand/category names as contextual strings / custom language model; keep a short on-device catalogue index for exact product-name matching after transcription.
4. **Confirm by voice before any purchase** ("Black Nike Pegasus, size 10, $89 — shall I buy it?") — this is an accessibility requirement, not a nice-to-have, and it absorbs STT errors.
5. **TTS on-device** (AVSpeechSynthesizer / Android TTS) for reading results and prices aloud. No server, no per-minute cost.

**On your server (still needs keys — but short, stateless, cacheable requests):**
6. **One text endpoint, not a voice session:** phone sends *text* (the transcript) + language + user ID. Server: (i) intent/slots via a cheap text LLM (GPT-5 mini class) or rules for common commands; (ii) **one Brave or Serper search per product query** (Serper first on price; Brave if you want an independent index — budget $0.001–$0.005 per search); (iii) fetch/verify price from the retailer at checkout; (iv) return a short spoken answer (1–2 sentences, price first).
7. **Cache aggressively:** product search results, prices (short TTL), and common queries ("cheapest X") in Redis/CDN. A cache hit costs $0 and has no TPM. Deduplicate identical searches from many users.
8. **Protect the keys and the budget:** master keys only on the server; per-user daily/minute caps in your gateway (e.g. X searches + Y LLM turns per user per day); hard monthly spend limit in OpenAI (Settings → Organization → Limits → Edit spend limit → Enforce a hard limit) *and* in Brave/Serper (prepaid credits are a natural cap); alerts at 75%/90%; queue + graceful degradation ("Search is busy, please try again in a moment") instead of dropping calls; **never put the OpenAI key in the app**.
9. **Keep OpenAI Realtime only as an optional mode, not the default:** e.g. a "live assistant" toggle for users who want free-form conversation. Behind it: server-minted ephemeral keys, a hard concurrent-session cap in your gateway (well below Grow's TPM ceiling), mini model by default, context truncation, and automatic fallback to the text pipeline when TPM/429 hits. Budget it separately — it will always be the most expensive path per minute.
10. **Scale plan by stage:** <1,000 daily users — on-device STT + text LLM + Serper/Brave, single small server, Grow tier is ample. 1,000–10,000 simultaneous — stateless replicas + load balancer, Redis cache, per-user caps, watch TPM and search QPS (Brave 50 req/s, Serper 50–300 req/s — raise/buy a bigger pack before you hit it). 10,000–100,000 — multi-region replicas, second LLM/search provider as failover, Enterprise/Scale Tier conversation with OpenAI *only if* you keep a live-voice mode, and a paid plan / usage-based pricing for the app itself, because at that volume the LLM+search bill alone (even without voice) is thousands per month and must be funded by revenue, not by one daily budget.

**What stays on the phone vs what still needs a server:**

| Stays on the phone | Still needs a server / key |
|---|---|
| Speech-to-text (Apple/Android/Whisper/Vosk) | Understanding intent (cheap text LLM) |
| Text-to-speech (reading answers/prices aloud) | Web/product search (Brave/Serper) |
| Microphone, audio, confirmation UI | Live price verification, retailer/checkout APIs |
| Catalogue matching for known products, command handling | Account, orders, payment, recommendations, abuse control |
| Language model download (one per language) | Key management, per-user budgets, caching, failover |

---

## Could not verify / open questions

1. **Apple SFSpeechRecognizer on-device limits:** whether the 1-minute and 1,000/hour limits apply to `requiresOnDeviceRecognition = true` requests or only to the server path — sources disagree / flag as unconfirmed. Test on device; do not assume on-device is uncapped.
2. **Apple on-device language count:** older list says 10+ languages; a 2026 secondary source says "roughly 60". The SpeechTranscriber list (22 languages, Aug 2026) is the most specific and is used in §1. Re-check `supportedLocales` on a real iOS 26 device for the exact 50 languages AIN Shop claims.
3. **Android offline pack limit (4 packs) and ML Kit 100+ languages:** the 100+ figure is from Google's Nov 2026 blog for the newest system models, not from the ML Kit docs page (which lists 15/21 locales). The 4-pack limit is from a single field report. Both need device testing.
4. **SpeechAnalyzer custom vocabulary:** some sources say `contextualStrings` works, others say custom vocabulary is "not yet supported" on SpeechAnalyzer. Unresolved — test, and keep SFSpeechRecognizer for vocabulary biasing if needed.
5. **Apple developer docs page for SFSpeechRecognizer** (`https://developer.apple.com/documentation/speech/sfspeechrecognizer`) returned no extractable content when fetched on 20 Nov 2026 — Apple limits are therefore cited via Apple's docs as mirrored/quoted in secondary sources (docs.rs, Picovoice, QA1951). Re-verify directly in Xcode / Apple docs before shipping.
6. **GPT-5 mini text pricing** ($0.25/1M in, $2/1M out) is from secondary pricing trackers checked 18 Nov 2026, not from an OpenAI page opened in this research. Re-check on OpenAI's pricing page.
7. **Google Cloud STT rounding:** V1 bills per 15 seconds; V2 tier table is per minute. Confirm the current V2 rounding rule on the pricing page before budgeting.
8. **No live browser test was done** of AIN Shop itself, of a real iPhone/Android device, or of the OpenAI dashboard (signed-out research, no account). All dashboard navigation is from OpenAI's docs + community posts.
9. **Exact AIN Shop usage is unknown** (minutes/user/day, languages actually used, % of users on iOS 26 vs older, Android device mix). All cost/scale numbers in §4b–4c are arithmetic from listed rates under stated assumptions — replace the assumptions with real telemetry before committing to a tier or a price.

## Sources

*Read 20 Nov 2026 unless noted. "Verified live" = page opened and read in this research; "index" = search-result snippet / summary.*

**Apple iOS**
- Apple SFSpeechRecognizer docs (mirrored/quoted) — https://docs.rs/objc2-speech/latest/x86_64-apple-darwin/objc2_speech/struct.SFSpeechRecognizer.html — index, 1-min limit, network-service limits, `supportsOnDeviceRecognition`.
- Picovoice, Speech Recognition in iOS: Complete 2026 Guide — https://picovoice.ai/blog/ios-speech-recognition/ — index, 1-min + 1,000/hr/device, SpeechAnalyzer vs SFSpeechRecognizer.
- Fora Soft, iOS Speech Recognition SDKs in 2026 — https://www.forasoft.com/blog/article/speech-recognition-with-neural-networks-on-ios-1621 — index, free, SpeechAnalyzer on-device only, no cap, WhisperKit.
- LoroNote, Apple SpeechAnalyzer vs Whisper (2026) — https://loronote.com/en/blog/apple-speechanalyzer-vs-whisper — index, 42 locales / 22 languages, 2.12% WER benchmark caveats.
- Rohit Raj, Apple SpeechAnalyzer vs Whisper — https://rohitraj.tech/notes/apple-speechanalyzer-vs-whisper-on-device-stt-2026 — index, WER table.
- SwiftCrafted, SpeechAnalyzer iOS 26 Swift Guide — https://swiftcrafted.dev/article/speechanalyzer-speechtranscriber-ios-26-swift — index.
- ThinkScribe, Offline speech to text on iPhone — https://thinkscribe.ai/en/blog/offline-speech-to-text-iphone-how-it-works — index.
- WWDC 2019 summary — https://manuals.plus/video/f12322447f8561aa50708b8404518710512922649fb6e47b672e62410e82a78c — index, server vs on-device table.
- Design-options note citing QA1951 — https://github.com/cinimody/dosbts/blob/HEAD/docs/plans/2026-08-09-voice-v1-design-options.md — index.

**Android**
- Android Developers, SpeechRecognizer — https://developer.android.com/reference/android/speech/SpeechRecognizer — index, "likely to stream audio to remote servers… not intended for continuous recognition".
- Google ML Kit, GenAI Speech Recognition API — https://developers.google.com/ml-kit/genai/speech-recognition/android — **verified live 20 Nov 2026**, Basic/Advanced, locales, devices, last updated 2026-11-14.
- Google Developers Blog, On-Device Speech Recognition and TTS in AI Edge Gallery, 10 Nov 2026 — https://developers.googleblog.com:443/on-device-speech-recognition-and-text-to-speech-in-google-ai-edge-gallery/ — index, 100+ languages, 8–9% WER FLEURS, 10× real-time, 0 MB APK.
- HackerNoon, Testing Android's On-Device Speech Recognition — https://hackernoon.com/testing-androids-on-device-speech-recognition-with-hindi-english-code-switching — index, `createOnDeviceSpeechRecognizer()` API 31, crash if not checked.
- Medium, Offline P2P Voice Translator — https://medium.com/@firlejczyk/how-we-built-an-offline-zero-latency-p2p-voice-translator-for-industrial-handsets-5e6299e753fb — index, 4-pack limit (unverified).
- GitHub issue, createOnDeviceSpeechRecognizer bypass — https://github.com/santawho/oeffi-ng/issues/64 — index.
- Voice.ai, Android Speech-to-Text API — https://voice.ai/hub/ai-voice-agents/android-speech-to-text-api/ — index, 120+ languages cloud.

**On-device alternatives**
- Vosk official models — https://alphacephei.com/vosk/models.html — index, small 40 MB en-US 9.85% WER, large 1.8 GB 5.69%.
- WhipScribe Vosk models — https://whipscribe.com/tools/vosk — index.
- DEV, On-device streaming ASR in 2026 — https://dev.to/voxrtio/on-device-streaming-asr-in-2026-five-approaches-and-when-to-pick-what-5h1n#comments — index, whisper.cpp sizes, 99 languages, streaming caveat.
- whisper.cpp overview — https://www.x-cmd.com/install/whisper.cpp/ — index.
- Parakeet vs Whisper vs Apple test — https://dev.to/yapapp/parakeet-v3-vs-whisper-vs-apples-on-device-model-in-25-languages-every-transcript-published-3bjo — index.

**Paid cloud STT**
- OpenAI Whisper model page — https://developers.openai.com/api/docs/models/whisper-1 — **verified live 20 Nov 2026**, $0.006/min, Deprecated, RPM/RPD by tier.
- Cartesia, OpenAI Whisper API pricing 2026 — https://www.cartesia.ai/learn/openai-whisper-api-pricing — index, deprecation 26 Feb 2027, gpt-transcribe $0.0045 / gpt-live-transcribe $0.017.
- SayNota, Whisper pricing — https://saynota.com/blog/openai-transcription-cost-per-hour — index, same deprecation.
- Google Cloud Speech-to-Text product — https://cloud.google.com/speech-to-text?hl=en — index, V2 $0.016/min, Chirp 3 85+ languages.
- Google Cloud Speech-to-Text pricing — https://cloud.google.com/speech-to-text/priv/pricing — index, V1 $0.024/min above 60 free min.
- AssemblyAI, Google Cloud STT alternatives — https://www.assemblyai.com/blog/google-cloud-speech-to-text-alternatives — index, prices checked 17 Nov 2026, Chirp 3 4.3% WER, volume tiers.
- Speechmatics vs Google — https://www.speechmatics.com/how-we-compare/google-alternative — index, $0.016/min tiers.
- DEV, Whisper vs Google STT vs Deepgram — https://dev.to/zephyr_zheng_0bfed478de52/whisper-vs-google-stt-vs-deepgram-2026-comparison-56e0 — index, WER ranges.
- EdenAI, Apple SpeechAnalyzer vs Cloud STT — https://www.edenai.co/post/apple-speechanalyzer-vs-cloud-stt-benchmarks-and-costs — index.

**Scaling / voice architecture**
- AutoInterviewAI, Deploy and Scale Voice AI Agents — https://www.autointerviewai.com/blog/deploy-scale-voice-ai-agents-cloud-production-2026 — index, decoupled pools, 1,000-call matrix.
- CallSphere, Capacity Planning for Voice AI — https://callsphere.ai/blog/vw3c-capacity-planning-voice-ai-concurrent-calls — index, three breakages, TPM/GPU, 2.5k crossover.
- MadeByDP, Voice AI Has a Networking Problem — https://www.madebydp.com/words/voice-ai-networking-problem — index, stateful sessions.

**Web search APIs**
- Brave Search API pricing (official) — https://api-dashboard.search.brave.com/documentation/pricing — index, $5/1,000, $5 credit/mo, 50 req/s.
- Serper pricing (ColdIQ, verified 5 Jul 2026) — https://coldiq.com/blog/serper-pricing — index, $1.00–$0.30/1,000, 2,500 free, 6-mo expiry.
- SERP APIs compared — https://dev.to/kevin_menesesgonzlez/7-best-serp-apis-in-2026-price-per-1000-searches-compared-441a — index, checked 4 Nov 2026.
- SERP pricing 1,000 searches on 10 APIs — https://dev.to/serpkite/serp-api-pricing-in-2026-1000-google-searches-on-10-apis-2ml9 — index.
- Google Custom Search JSON API (official) — https://developers.google.com/custom-search/v1/overview — index, $5/1,000, 100 free/day, 10k/day cap, closed to new customers, discontinued 1 Jan 2027.
- Cheaper alternatives to Google Search API — https://dev.to/serpkite/cheaper-alternatives-to-the-google-search-api-in-2026-4kh2 — index.

**OpenAI at scale / tiers / Realtime**
- OpenAI Rate limits (official) — https://developers.openai.com/api/docs/guides/rate-limits — **verified live 20 Nov 2026**, tiers Build/Launch/Grow, monthly caps, Settings > Organization > Limits, Upgrade tier, spend limits, slow_down / 50%-per-15-min ramp rule, Scale Tier.
- OpenAI gpt-realtime-2.1-mini model page — https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini — **verified live 20 Nov 2026**, $10/$20 audio per 1M, 400/200k Build, 10k/4M Launch, 20k/15M Grow.
- OpenAI Scale Tier — https://openai.com/api-scale-tier/ — index, Enterprise, token units, 99.9% SLA.
- OpenAI Introducing the Realtime API — https://openai.com/index/introducing-the-realtime-api/ — index, Feb 2025: no simultaneous-session limit.
- Fora Soft, OpenAI Realtime API Pricing (Nov 2026) — https://www.forasoft.com/blog/article/openai-realtime-api-pricing — index, $32/$64 per 1M, $0.06–$0.11/min flagship, $0.02–$0.05 mini, GPT-Live $0.05/min, 50/300/500 sessions.
- Layer3Labs, Realtime pricing — https://www.layer3labs.io/guides/openai-realtime-api-pricing — index, 1,000 daily users cost example.
- Lexicost, OpenAI pricing/limits — https://lexicost.com/voice-agents/vendors/openai — index, gpt-live-1 50/300/500, gpt-realtime-2.1 TPM by tier.
- Retell, Best Speech-to-Speech APIs — https://www.retellai.com/blog/best-speech-to-speech-ai-apis-phone-calls — index, GPT-Live $0.05/min + backend.
- OpenAI community, max parallel Realtime sessions — https://community.openai.com/t/maximum-number-of-parallel-real-time-sessions-on-a-single-openai-api-key/1362278 — index, limits are org-level not per-key.
- OpenAI community, how to set org usage limits — https://community.openai.com/t/how-to-set-organization-usage-limits/1332014/8 — index, Edit Budget / Edit spend limit.
- Rho, LLM API Spending Limits — https://www.rho.co/blog/llm-api-spending-limits — index, hard limit 429, enforcement lag.
- Layer3Labs, OpenAI API Usage Tiers — https://www.layer3labs.io/guides/openai-api-usage-tiers — index, Oct 2026 consolidation to Build/Launch/Grow.
- GPT-5 mini pricing (secondary) — https://broadrouter.com/llm-api-pricing/gpt-5-mini/ and https://neurogenesys.ai/tools/llm-pricing/gpt-5-mini — index, $0.25/1M in, $2/1M out, checked Nov 2026.
