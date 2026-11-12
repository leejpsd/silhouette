// Must not compile: the outbound payload type can only be minted inside SilhouetteCore.
// expect-error: 'CloudText' initializer is inaccessible due to 'internal' protection level
import SilhouetteCore

func forge(_ text: String) -> CloudText {
    CloudText(text)
}
