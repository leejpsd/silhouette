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
ITEMS="routing.json copy rulepacks/us-ca/pack.json rulepacks/us-ca/copy rulepacks/us-ca/judges-household.json bands/us-ca.json design/tokens.json skeleton/allowlist schemas/pointer.paystub.json samples prompts fixtures/device-check/cases.json fixtures/device-check/documents fixtures/device-check/answers.json"

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

# The on-device check's recorded runs this app bundles (shared/validation/DEVICE_CHECK.md section 5):
# its own baseline and latest, the files directly in eval/on-device/ (history/ is not bundled).
mkdir -p "$DEST/recordings"
for run in "$IOS_DIR"/eval/on-device/device-check-*.json; do
  [ -e "$run" ] && cp "$run" "$DEST/recordings/"
done

# The held-out paystubs (web/eval/heldout/, frozen before measuring), as they are: the 24 paystubs and their
# answer keys, for the held-out run on this device. The W-2s of that folder are no longer held out.
mkdir -p "$DEST/heldout"
for doc in "$IOS_DIR"/../web/eval/heldout/hp-*.txt "$IOS_DIR"/../web/eval/heldout/hp-*.gold.json; do
  [ -e "$doc" ] && cp "$doc" "$DEST/heldout/"
done
# Held-out runs recorded on an iPhone (eval/on-device/heldout/).
mkdir -p "$DEST/recordings/heldout"
for run in "$IOS_DIR"/eval/on-device/heldout/*.json; do
  [ -e "$run" ] && cp "$run" "$DEST/recordings/heldout/"
done

# The recorded cloud reading of the sample paystub (routing.json recordedCloud): the same file the web app
# uses, bundled as it is.
mkdir -p "$DEST/recordings/cloud"
for rec in "$IOS_DIR"/../web/eval/results/cloud-recording/*.json; do
  [ -e "$rec" ] && cp "$rec" "$DEST/recordings/cloud/"
done

# Remote Config defaults: the template the Firebase project is published from.
TEMPLATE="$IOS_DIR/../firebase/remoteconfig.template.json"
if [ -f "$TEMPLATE" ]; then
  cp "$TEMPLATE" "$DEST/remoteconfig.template.json"
fi

echo "Synced shared/{$(echo $ITEMS | tr ' ' ',')} -> $DEST"
