# Silhouette iOS. Run from ios/.
SIMULATOR ?= iPhone 18 Pro
DERIVED   := build/DerivedData

.PHONY: all test routing-proof project build edge-cases clean

all: test routing-proof build

## SilhouetteCore unit and conformance tests (reads ../shared directly)
test:
	cd SilhouetteCore && swift test

## Compile-time check that Raw cannot reach a cloud-capable call
routing-proof:
	scripts/routing-proof.sh

## Regenerate Silhouette.xcodeproj from project.yml (needs xcodegen)
project:
	xcodegen generate

## Build the app for the simulator
build:
	xcodebuild -scheme Silhouette -destination 'platform=iOS Simulator,name=$(SIMULATOR)' -derivedDataPath $(DERIVED) build

## Regenerate the Swift/JavaScript edge cases from shared/reference (needs node)
edge-cases:
	node scripts/gen-edge-cases.mjs

clean:
	rm -rf build SilhouetteCore/.build
