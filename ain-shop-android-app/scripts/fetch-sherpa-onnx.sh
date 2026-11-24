#!/usr/bin/env bash
# Fetch the vendored sherpa-onnx AAR for on-device Whisper (see app/libs/README.md).
# sherpa-onnx is not on Maven Central; it ships as a GitHub release AAR.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p app/libs
VERSION="1.13.3"
AAR="sherpa-onnx-static-link-onnxruntime-${VERSION}.aar"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v${VERSION}/${AAR}"
echo "Downloading ${AAR} ..."
curl -fSL --retry 3 -o "app/libs/${AAR}" "${URL}"
echo "Saved to app/libs/${AAR}"
ls -lh "app/libs/${AAR}"
