# Silhouette iOS. Run from ios/.
SIMULATOR ?= iPhone 18 Pro
DERIVED   := build/DerivedData

SCREENSHOT_DIR ?= $(CURDIR)/build/screenshots
DESTINATION := 'platform=iOS Simulator,name=$(SIMULATOR)'

.PHONY: all test test-ios app-test ui-test screenshots snapshots snapshots-device routing-proof project build edge-cases clean

all: test routing-proof build

## SilhouetteCore unit and conformance tests (reads ../shared directly)
test:
	cd SilhouetteCore && swift test

## SilhouetteCore and SilhouetteKit tests on the iOS simulator (the Skeletonizer uses the OS's ICU)
test-ios:
	cd SilhouetteCore && xcodebuild test -scheme SilhouetteCore-Package -destination $(DESTINATION) -derivedDataPath ../build/PackageDerivedData

## Unit tests of the app against the Firebase SDK (its hybrid session and the app's step around the cloud side)
app-test:
	xcodebuild test -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) -only-testing:SilhouetteTests

## XCUITests for the flows and how they behave under the hand
ui-test:
	xcodebuild test -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) -only-testing:SilhouetteUITests/QuickCheckUITests -only-testing:SilhouetteUITests/DocumentFlowUITests -only-testing:SilhouetteUITests/AnswersUITests -only-testing:SilhouetteUITests/DeviceCheckUITests -only-testing:SilhouetteUITests/InteractionUITests -only-testing:SilhouetteUITests/JudgedPathUITests -only-testing:SilhouetteUITests/ReadingShowUITests -only-testing:SilhouetteUITests/DestinationUITests -only-testing:SilhouetteUITests/JudgesRunAllUITests -only-testing:SilhouetteUITests/RecordPlainWordsUITests

## Screenshot tour (light and dark, English and Spanish, largest accessibility text) into SCREENSHOT_DIR.
## SCREENSHOT_CONFIGS limits it, for example SCREENSHOT_CONFIGS=en-light,es-dark
screenshots:
	mkdir -p $(SCREENSHOT_DIR)
	TEST_RUNNER_SCREENSHOT_DIR=$(SCREENSHOT_DIR) TEST_RUNNER_SCREENSHOT_CONFIGS=$(SCREENSHOT_CONFIGS) xcodebuild test -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) -only-testing:SilhouetteUITests/ScreenshotTour

## Fast snapshots of every screen and state, set by the app itself (no UI automation), into SNAPSHOT_DIR.
## SNAPSHOT_CONFIGS limits the configurations (en-light, en-light-ax5, en-dark, en-dark-ax5, es-…),
## SNAPSHOT_SCENES the scenes. About 40 s per configuration.
SNAPSHOT_DIR ?= $(CURDIR)/build/snapshots
APP_PATH := $(DERIVED)/Build/Products/Debug-iphonesimulator/Silhouette.app
snapshots:
	xcodebuild -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) build -quiet
	scripts/snapshots.sh "$(SIMULATOR)" $(APP_PATH) $(SNAPSHOT_DIR) cloud "$(SNAPSHOT_CONFIGS)" "$(SNAPSHOT_SCENES)"

## The same with a scripted on-device model: reading kept on the device, the on-device check run
DEVICE_SCENES := review-sample,preview-keep,device-check,device-check-run,program-answer,record-sent
snapshots-device:
	xcodebuild -scheme Silhouette -destination $(DESTINATION) -derivedDataPath $(DERIVED) build -quiet
	scripts/snapshots.sh "$(SIMULATOR)" $(APP_PATH) $(SNAPSHOT_DIR)-device device "$(SNAPSHOT_CONFIGS)" "$(or $(SNAPSHOT_SCENES),$(DEVICE_SCENES))"

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
