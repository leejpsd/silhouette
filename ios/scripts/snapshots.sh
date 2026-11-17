#!/bin/sh
# Fast snapshots: installs the simulator build and launches it in capture mode. The app sets each
# scene's state itself (no UI automation) and writes PNG files, then DONE.txt, into OUT.
# A scripted model stands in for Firebase AI Logic; nothing is sent anywhere.
#   scripts/snapshots.sh <simulator name> <app path> <out folder> <model> [configs] [scenes]
# configs: comma-separated, for example en-light,es-dark-ax5 (all eight when empty)
# scenes: comma-separated scene names (all when empty)
set -eu
SIM="$1"; APP="$2"; OUT="$3"; MODEL="$4"; CONFIGS="${5:-}"; SCENES="${6:-}"
BUNDLE=app.silhouette.benefits

xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" >/dev/null
xcrun simctl install "$SIM" "$APP"
rm -rf "$OUT"; mkdir -p "$OUT"
set -- -UITestResetAll -UITestModel "$MODEL" -AppleLanguages "(en)" -AppleLocale en_US -SnapshotCapture "$OUT"
[ -n "$CONFIGS" ] && set -- "$@" -SnapshotConfigs "$CONFIGS"
[ -n "$SCENES" ] && set -- "$@" -SnapshotScenes "$SCENES"
xcrun simctl terminate "$SIM" "$BUNDLE" 2>/dev/null || true
xcrun simctl launch "$SIM" "$BUNDLE" "$@" >/dev/null
started=$(date +%s)
while [ ! -f "$OUT/DONE.txt" ]; do
  if [ $(( $(date +%s) - started )) -gt 1800 ]; then echo "no DONE.txt after 30 minutes" >&2; exit 1; fi
  sleep 2
done
xcrun simctl terminate "$SIM" "$BUNDLE" 2>/dev/null || true
cat "$OUT/DONE.txt"
