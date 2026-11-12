// Data types and the routing rule: shared/DATA_TYPES.md and shared/routing.json.
//
// - Raw<Value>          exact personal values. Opaque: printing, string interpolation, dump() and
//                       Mirror show a fixed marker; no Codable, no Equatable. The value can be read
//                       only inside this Swift package (`package` access).
// - Skeleton            a document silhouette. Produced only by `Skeletonizer.skeletonize`.
// - Generalized<Value>  the profile silhouette. Produced only by `Generalizer.generalize`.
// - Public<Value>       static content shipped with the app.
// - CloudSafe           implemented by Skeleton, Generalized and Public. A cloud-capable call
//                       takes `some CloudSafe`; `Raw` does not conform, so passing it does not
//                       type-check.
//
// What reaches the network is a `CloudText`, whose initializer is internal to this module. Even a
// retroactive `extension Raw: CloudSafe` written elsewhere could only hand over a CloudText minted
// here from a Skeleton, Generalized or Public value, never the Raw value itself (which it cannot
// read). `RoutingProof/` checks these properties with the compiler.

// MARK: - Raw

/// An exact personal value. Never enters a cloud-capable call.
public struct Raw<Value> {
    /// The wrapped value. Readable only by deterministic code inside this package.
    package let value: Value

    public init(_ value: Value) {
        self.value = value
    }

    /// Applies a deterministic transformation without unwrapping the result.
    package func map<Result>(_ transform: (Value) throws -> Result) rethrows -> Raw<Result> {
        Raw<Result>(try transform(value))
    }
}

extension Raw: Sendable where Value: Sendable {}

extension Raw: CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    public static var redactionMarker: String { "[Raw]" }
    public var description: String { Self.redactionMarker }
    public var debugDescription: String { Self.redactionMarker }
    /// `dump()`, `Mirror(reflecting:)` and debugger summaries see no children.
    public var customMirror: Mirror { Mirror(self, children: [], displayStyle: .struct) }
}

// MARK: - Cloud-safe types

/// The text a cloud-capable call may send. Only this module can create one.
public struct CloudText: Sendable, Hashable {
    public let text: String
    init(_ text: String) { self.text = text }
}

/// `Skeleton | Generalized | Public`: the only input a cloud-capable call accepts
/// (shared/DATA_TYPES.md). Conforming types live in this module.
public protocol CloudSafe: Sendable {
    var cloudText: CloudText { get }
}

/// A document silhouette (shared/skeleton/SPEC.md): every number, date and non-allowlisted word
/// replaced by a placeholder.
public struct Skeleton: CloudSafe, Hashable, CustomStringConvertible {
    public let text: String
    init(text: String) { self.text = text }
    public var cloudText: CloudText { CloudText(text) }
    public var description: String { text }
}

/// A generalized (banded) description of the user, with its canonical serialization.
public struct Generalized<Value: Sendable>: CloudSafe {
    public let value: Value
    /// The canonical serialization (shared/rulepacks/SPEC.md section 6).
    public let canonical: String
    init(value: Value, canonical: String) {
        self.value = value
        self.canonical = canonical
    }
    public var cloudText: CloudText { CloudText(canonical) }
}

/// Public, static content shipped with the app (program names, rule text, jurisdiction ids,
/// prepared question chips).
public struct Public<Value: Sendable>: CloudSafe {
    public let value: Value
    let text: String
    init(value: Value, text: String) {
        self.value = value
        self.text = text
    }
    public var cloudText: CloudText { CloudText(text) }
}

extension Public where Value == String {
    /// Public text written in source code. `StaticString` accepts only literals, so a runtime
    /// string (for example something the user typed) cannot be wrapped this way.
    public init(_ literal: StaticString) {
        let text = literal.description
        self.init(value: text, text: text)
    }

    /// Public text loaded from content bundled with the app (rule packs, copy). Package-only so
    /// that app code cannot relabel arbitrary strings as Public.
    package init(bundled text: String) {
        self.init(value: text, text: text)
    }
}

// MARK: - The boundary

/// The single entry point through which a cloud-capable call obtains its payload.
public enum CloudBoundary {
    public static func outbound(_ value: some CloudSafe) -> CloudText {
        value.cloudText
    }
}
