# Wake word — sources, read 2026-11-20
- Porcupine: 97%+ detection, <1 false alarm/10h, <1MB, <4% one Pi3 core; free plan non-commercial, 1 MAU; Foundation $6,000/yr, 100 MAU; Enterprise from $30,000/yr. Custom wake word via Picovoice Console, AccessKey required.
  https://voxrt.com/wake-word-comparison ; https://outspoken.cloud/blog/best-wake-word-tools ; https://www.exploreai.directory/tools/picovoice
- openWakeWord: Apache 2.0, target <0.5 false accepts/hour and <5% false rejects, 80ms frames, pretrained models English only, custom training from synthetic TTS speech, ONNX.
  https://pypi.org/project/openwakeword/0.1.1/ ; https://get.jinn.today/blog/jinn-wake-word-system (independent test: 4.2% false reject, 0.3/hour false accept, <5% CPU)
- iOS: no OS-level custom wake word (Siri only); third-party must keep AVAudioSession + audio background mode, mic indicator on, App Store scrutiny. SFSpeechRecognizer 1 min/request, 1,000/hr/device.
  https://picovoice.ai/blog/ios-speech-recognition/ ; https://www.signaltrace.wiki/voice-activated-help/TechnicalConstraints/iOS-Background-Audio-Constraints
- Web: no mic when page hidden/screen locked; Web Speech API Chrome auto-stops ~3s silence, Safari server-based, Firefox no support.
  https://vadimall.com/posts/voice-ai-assistant-browser-typescript-web-speech-api
- Privacy model: rolling buffer, local scoring, discard non-matching audio, nothing sent until trigger.
  https://www.heyviolet.io/learn/wake-words-and-privacy
