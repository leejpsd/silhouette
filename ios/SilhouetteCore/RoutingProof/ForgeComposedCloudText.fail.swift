// Must not compile: composing request text from arbitrary strings is package-only.
// expect-error: is inaccessible due to 'package' protection level
import SilhouetteCore

func forge(_ typed: String) -> CloudText {
    CloudText(composed: typed)
}
