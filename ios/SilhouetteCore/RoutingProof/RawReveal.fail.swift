// Must not compile: the value inside a Raw is not readable outside the SilhouetteCore package.
// expect-error: 'value' is inaccessible due to 'package' protection level
import SilhouetteCore

func leak(text: Raw<String>) -> String {
    text.value
}
