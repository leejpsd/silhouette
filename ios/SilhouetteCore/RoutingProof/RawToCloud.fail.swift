// Must not compile: a Raw value passed where CloudSafe is required.
// expect-error: requires that 'Raw<String>' conform to 'CloudSafe'
import SilhouetteCore

func leak(text: Raw<String>) {
    _ = CloudBoundary.outbound(text)
}
