# STT / TTS — sources, read 2026-11-20
- Apple SpeechAnalyzer (iOS 26+): entirely on-device, SpeechTranscriber, 42 locales / 22 languages as of Aug 2026, WER 2.12% clean LibriSpeech in one benchmark; no Hindi/Polish etc; DictationTranscriber fallback; models downloaded by system.
  https://loronote.com/en/blog/apple-speechanalyzer-vs-whisper ; https://blog.addpipe.com/apple-speechanalyzer-api/
- SFSpeechRecognizer (iOS 10+): requiresOnDeviceRecognition flag, 1 min/request, 1,000/hr/device.
  https://picovoice.ai/blog/ios-speech-recognition/
- Android ML Kit GenAI Speech Recognition (Nov 10 2026 Google blog): on-device, 100+ languages, 10x real-time; Basic mode API 31+, Advanced (Gemini Nano) Pixel 10 only initially. TTS starts ~100ms.
  https://developers.googleblog.com:443/on-device-speech-recognition-and-text-to-speech-in-google-ai-edge-gallery/
- Whisper/WhisperKit/whisper.cpp: 99 languages, tiny 39MB to large-v3 1.5B, on-device, free OSS, iOS/Android/WebAssembly.
  https://dodecaidr.pro/en/articles/whisperkit-on-device-transcription/ ; https://www.x-cmd.com/install/whisper.cpp/
- Cloud STT fallback Deepgram Nova-3 streaming: $0.0048/min promo, $0.0077/min list monolingual; multilingual $0.0058 promo / $0.0092 list; billed per second; 60+ languages.
  https://deepgram.com/pricing?ps_partner_key=Y29sb3JtYW5nb2xlZTk4MzU&ps_xid=WliiExMdHTl0bx&gsxid=WliiExMdHTl0bx&gspk=Y29sb3JtYW5nb2xlZTk4MzU
- On-device TTS free: iOS AVSpeechSynthesizer 50+ languages; Android Google Speech Recognition & Synthesis free, ~40+ languages, voice data download.
  https://www.tutorialpedia.org/blog/iphone-api-for-text-to-speech-feature/ ; https://frateca.com/blog/best-text-to-speech-engine-for-android/
- Cloud TTS: OpenAI tts-1 $15/1M chars, tts-1-hd $30/1M; ElevenLabs v4 $80/1M, Flash/Turbo $40/1M (~800 chars/min speech => $0.012, $0.032-0.064/min).
  https://www.assemblyai.com/blog/tts-api-pricing ; https://developers.openai.com/api/docs/pricing?multimodal-image-pricing=batch
