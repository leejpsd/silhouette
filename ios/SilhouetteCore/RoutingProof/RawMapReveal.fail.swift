// Must not compile: Raw.map would hand the value to a closure, so it is package-only too.
// expect-error: 'map' is inaccessible due to 'package' protection level
import SilhouetteCore

func leak(text: Raw<String>) {
    _ = text.map { print($0) }
}
