// Control: cloud-safe values do type-check at the boundary. If this file fails to compile, the
// failures in the other probes prove nothing.
import SilhouetteCore

func control(text: Raw<String>, allowlist: Allowlist, exact: Raw<ExactProfile>, bands: Bands) throws {
    let result = Skeletonizer.skeletonize(text, allowlist: allowlist)
    _ = CloudBoundary.outbound(result.skeleton)
    _ = CloudBoundary.outbound(try Generalizer.generalize(exact, bands: bands))
    _ = CloudBoundary.outbound(Public("Prepared question"))
}
