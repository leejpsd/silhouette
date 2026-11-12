// Must not compile: the placeholder map (Raw) passed where CloudSafe is required.
// expect-error: requires that 'Raw<PlaceholderMap>' conform to 'CloudSafe'
import SilhouetteCore

func leak(text: Raw<String>, allowlist: Allowlist) {
    let result = Skeletonizer.skeletonize(text, allowlist: allowlist)
    _ = CloudBoundary.outbound(result.map)
}
