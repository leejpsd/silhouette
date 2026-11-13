#!/bin/sh
# Copies Silhouette/GoogleService-Info.plist into the app bundle when it exists. The file is local
# only (git-ignored). Without it the app builds and runs fully on the device; cloud model requests
# report that this build has no Firebase configuration.
set -eu
SRC="$(cd "$(dirname "$0")/.." && pwd)/Silhouette/GoogleService-Info.plist"
DEST="$1"
if [ -f "$SRC" ]; then
  cp "$SRC" "$DEST/GoogleService-Info.plist"
  echo "Copied GoogleService-Info.plist"
else
  rm -f "$DEST/GoogleService-Info.plist"
  echo "warning: Silhouette/GoogleService-Info.plist not found. The app builds and runs on the device only; add the Firebase configuration for app.silhouette.benefits to enable cloud requests."
fi
