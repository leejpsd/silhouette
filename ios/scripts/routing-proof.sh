#!/bin/sh
# Compile-time routing proof (shared/DATA_TYPES.md, "Enforcing it in code").
#
# Builds SilhouetteCore and SilhouetteKit as modules, then type-checks every probe in
# SilhouetteCore/RoutingProof/ as code from another package (the app):
#   *.pass.swift must compile;
#   *.fail.swift must fail with the diagnostic named on its "// expect-error:" line.
# Exits non-zero if any probe behaves otherwise.
set -eu

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$IOS_DIR/SilhouetteCore"
PROBES="$CORE/RoutingProof"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/silhouette-routing.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

SWIFTC="xcrun --sdk macosx swiftc"

echo "Building SilhouetteCore and SilhouetteKit modules..."
$SWIFTC -emit-module -parse-as-library -swift-version 6 \
  -module-name SilhouetteCore -package-name SilhouetteCore \
  -emit-module-path "$WORK/SilhouetteCore.swiftmodule" \
  "$CORE"/Sources/SilhouetteCore/*.swift
# shellcheck disable=SC2046
$SWIFTC -emit-module -parse-as-library -swift-version 6 \
  -module-name SilhouetteKit -package-name SilhouetteCore -I "$WORK" \
  -emit-module-path "$WORK/SilhouetteKit.swiftmodule" \
  $(find "$CORE/Sources/SilhouetteKit" -name '*.swift')

failures=0
for probe in "$PROBES"/*.pass.swift; do
  name="$(basename "$probe")"
  if $SWIFTC -typecheck -swift-version 6 -I "$WORK" "$probe" >"$WORK/out.txt" 2>&1; then
    echo "ok    $name compiles"
  else
    echo "FAIL  $name should compile:"; sed 's/^/      /' "$WORK/out.txt"
    failures=$((failures + 1))
  fi
done

for probe in "$PROBES"/*.fail.swift; do
  name="$(basename "$probe")"
  expected="$(sed -n 's|^// expect-error: ||p' "$probe" | head -n 1)"
  if [ -z "$expected" ]; then
    echo "FAIL  $name has no '// expect-error:' line"; failures=$((failures + 1)); continue
  fi
  if $SWIFTC -typecheck -swift-version 6 -I "$WORK" "$probe" >"$WORK/out.txt" 2>&1; then
    echo "FAIL  $name compiled, but must not"; failures=$((failures + 1))
  elif grep -qF -- "$expected" "$WORK/out.txt"; then
    echo "ok    $name rejected: $(grep -m1 -F -- "$expected" "$WORK/out.txt" | sed 's/.*error: //')"
  else
    echo "FAIL  $name failed for another reason (expected: $expected):"; sed 's/^/      /' "$WORK/out.txt"
    failures=$((failures + 1))
  fi
done

if [ "$failures" -ne 0 ]; then
  echo "routing proof: $failures probe(s) did not behave as expected"; exit 1
fi
echo "routing proof: all probes behaved as expected"
