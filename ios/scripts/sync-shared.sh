#!/bin/sh
# Copies the contract files the app reads at runtime from ../shared into a destination folder.
# The Xcode build runs it with the app bundle's resources folder as destination, so the bundle
# always carries the current shared/ files and nothing is copied by hand.
#
# Usage: scripts/sync-shared.sh <destination>
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <destination>" >&2
  exit 2
fi

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHARED="$(cd "$IOS_DIR/../shared" && pwd)"
DEST="$1"

# Paths under shared/ that ship in the app bundle.
ITEMS="copy rulepacks/zz-test bands design/tokens.json skeleton/allowlist"

for item in $ITEMS; do
  if [ ! -e "$SHARED/$item" ]; then
    echo "error: shared/$item is missing" >&2
    exit 1
  fi
done

rm -rf "$DEST"
mkdir -p "$DEST"
for item in $ITEMS; do
  mkdir -p "$DEST/$(dirname "$item")"
  cp -R "$SHARED/$item" "$DEST/$item"
done

echo "Synced shared/{$(echo $ITEMS | tr ' ' ',')} -> $DEST"
