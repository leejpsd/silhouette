// Limit of the compile-time check: Swift allows a retroactive conformance from another module.
// It compiles, but it still cannot send the Raw value: CloudText cannot be created here and
// Raw.value cannot be read here, so the only payload it can return is one that SilhouetteCore
// minted from a Skeleton, Generalized or Public value.
import SilhouetteCore

extension Raw: @retroactive CloudSafe where Value == String {
    public var cloudText: CloudText { CloudBoundary.outbound(Public("not the raw value")) }
}
