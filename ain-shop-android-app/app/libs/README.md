# Vendored libraries (not committed to Git)

This folder holds the sherpa-onnx AAR for on-device Whisper — the backup
listener for languages the phone's own speech recognition doesn't cover.
sherpa-onnx is not on Maven Central, so it is vendored here from the
k2-fsa/sherpa-onnx GitHub release.

To fetch it, from the project root run:

    bash scripts/fetch-sherpa-onnx.sh

It downloads `sherpa-onnx-1.13.3.aar` (~37 MB) into this folder. The file
is git-ignored: a fresh clone must run the script again. The Gradle build
fails with a clear message (not a linker error) if the AAR is missing.

The Whisper model itself is NOT bundled: on first use, the app offers to
download the small multilingual Whisper model (tiny, about 75 MB) over
Wi-Fi into the app's own files, only if the user says yes. No training —
the model is used exactly as released.
