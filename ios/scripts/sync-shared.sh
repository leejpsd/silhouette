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
# The California pack is the one people see; zz-test is for tests and conformance fixtures only.
ITEMS="copy rulepacks/us-ca/pack.json rulepacks/us-ca/copy bands/us-ca.json design/tokens.json skeleton/allowlist schemas/pointer.paystub.json samples prompts"

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

# Remote Config defaults: the template the Firebase project is published from.
TEMPLATE="$IOS_DIR/../firebase/remoteconfig.template.json"
if [ -f "$TEMPLATE" ]; then
  cp "$TEMPLATE" "$DEST/remoteconfig.template.json"
fi

echo "Synced shared/{$(echo $ITEMS | tr ' ' ',')} -> $DEST"
