// The routing reasons of shared/routing.json, shown next to every model result
// ("On device · short text"). Copy key: `reason.{rawValue}`.

public enum RoutingReason: String, Sendable, CaseIterable {
    case photoNeverLeaves = "photo-never-leaves"
    case documentSilhouetteOnly = "document-silhouette-only"
    case shortText = "short-text"
    case longOrUnsupportedLocale = "long-or-unsupported-locale"
    case preparedQuestion = "prepared-question"
    case typedTextMayBePersonal = "typed-text-may-be-personal"
    case needsCurrentInfo = "needs-current-info"
    case needsPlaces = "needs-places"
    case speech
    /// `onDeviceFailure`: a PREFER_ON_DEVICE task retried once in the cloud.
    case onDeviceFailed = "on-device-failed"

    public var copyKey: String { "reason.\(rawValue)" }
}
