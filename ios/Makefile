# Silhouette iOS. Run from ios/.
SIMULATOR ?= iPhone 18 Pro
DERIVED   := build/DerivedData

SCREENSHOT_DIR ?= $(CURDIR)/build/screenshots
DESTINATION := 'platform=iOS Simulator,name=$(SIMULATOR)'

.PHONY: all test test-ios ui-test screenshots routing-proof project build edge-cases clean

all: test routing-proof build

## SilhouetteCore unit and conformance tests (reads ../shared directly)
test:
	cd SilhouetteCore && swift test

## SilhouetteCore and SilhouetteKit tests on the iOS simulator (the Skeletonizer uses the OS's ICU)
test-ios:
	cd SilhouetteCore && xcodebuild test -scheme SilhouetteCore-Package -destination $(DESTINATION) -derivedDataPath ../build/PackageDerivedData

## XCUITests for the Quick Check flows
ui-test:
	xcodebuild test -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) -only-testing:SilhouetteUITests/QuickCheckUITests -only-testing:SilhouetteUITests/DocumentFlowUITests -only-testing:SilhouetteUITests/AnswersUITests

## Screenshot tour (light and dark, English and Spanish, largest accessibility text) into SCREENSHOT_DIR.
## SCREENSHOT_CONFIGS limits it, for example SCREENSHOT_CONFIGS=en-light,es-dark
screenshots:
	mkdir -p $(SCREENSHOT_DIR)
	TEST_RUNNER_SCREENSHOT_DIR=$(SCREENSHOT_DIR) TEST_RUNNER_SCREENSHOT_CONFIGS=$(SCREENSHOT_CONFIGS) xcodebuild test -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) -only-testing:SilhouetteUITests/ScreenshotTour

## Compile-time check that Raw cannot reach a cloud-capable call
routing-proof:
	scripts/routing-proof.sh

## Regenerate Silhouette.xcodeproj from project.yml (needs xcodegen)
project:
	xcodegen generate

## Build the app for the simulator
build:
	xcodebuild -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) build

## Regenerate the Swift/JavaScript edge cases from shared/reference (needs node)
edge-cases:
	node scripts/gen-edge-cases.mjs

clean:
	rm -rf build SilhouetteCore/.build
