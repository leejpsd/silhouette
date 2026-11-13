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
    /// Tasks given the person's own result, which may run only on this device.
    case yourResultStaysOnDevice = "your-result-stays-on-device"
    /// `onDeviceFailure`: a PREFER_ON_DEVICE task retried once in the cloud.
    case onDeviceFailed = "on-device-failed"
    /// `offlineSample`: a bundled sample filled from its fixed answer key; no model, nothing sent.
    case sampleAnswerKey = "sample-answer-key"

    public var copyKey: String { "reason.\(rawValue)" }
}
