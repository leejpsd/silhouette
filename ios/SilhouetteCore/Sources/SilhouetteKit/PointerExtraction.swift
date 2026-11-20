// Task `document.pointer.extract` (shared/routing.json): the input is a Skeleton only. A reader
// (a model, or the fixed answers of a built-in sample) answers with placeholder ids; the Rehydrator
// fills in the values on this device. Because the only document input type is `Skeleton`, no Raw
// value can be handed to an extractor.

import Foundation
import SilhouetteCore

/// Where an answer was produced.
public enum InferenceSource: String, Sendable {
    case onDevice = "ON_DEVICE"
    case inCloud = "IN_CLOUD"
    /// No model: the fixed answers of a built-in sample document.
    case sampleAnswerKey = "SAMPLE_ANSWER_KEY"
    /// routing.json `recordedCloud`: a real cloud reading of the bundled sample's silhouette, recorded
    /// with its exact request; the values are put back on this device now and nothing is sent.
    case recordedCloud = "RECORDED_CLOUD"
    /// routing.json `recordedSample`: the on-device model's own recorded answer to the bundled sample's
    /// silhouette, made on an iPhone; the values are put back on this device now and nothing is sent.
    case recordedDevice = "RECORDED"
}

public struct PointerRequest: Sendable {
    public let skeleton: Skeleton
    public let docType: String
    public let language: AppLocale

    public init(skeleton: Skeleton, docType: String = "paystub", language: AppLocale) {
        self.skeleton = skeleton
        self.docType = docType
        self.language = language
    }
}

/// The pointer JSON (untrusted: the Rehydrator validates every reference), where it was produced,
/// and the routing reason.
public struct PointerResult: Sendable {
    public let pointers: JSON
    public let source: InferenceSource
    public let reason: RoutingReason
    /// Fields left out as not read on this device.
    public var notRead: [String] = []

    public init(pointers: JSON, source: InferenceSource, reason: RoutingReason, notRead: [String] = []) {
        self.pointers = pointers
        self.source = source
        self.reason = reason
        self.notRead = notRead
    }
}

public struct ExtractorUnavailable: Error, Sendable {}

/// Reads pointers from a document silhouette. Implementations: a model, or the sample answer key.
public protocol PointerExtractor: Sendable {
    /// Where a request goes, for the outbound log ("this device" when nothing is sent).
    var destination: String { get }
    /// Whether this extractor can read `skeleton` at all, without sending anything.
    func canRead(_ skeleton: Skeleton, language: AppLocale) -> Bool
    func extract(_ request: PointerRequest) async throws -> PointerResult
}

/// The single path from a document silhouette to an extractor: the first that can read it.
/// Model extractors record their requests in `OutboundLog` before sending; the sample answer key
/// sends nothing.
public struct PointerExtraction: Sendable {
    public let extractors: [any PointerExtractor]

    public init(extractors: [any PointerExtractor]) {
        self.extractors = extractors
    }

    public func extractor(for skeleton: Skeleton, language: AppLocale) -> (any PointerExtractor)? {
        extractors.first { $0.canRead(skeleton, language: language) }
    }

    public func extract(_ request: PointerRequest) async throws -> PointerResult {
        guard let extractor = extractor(for: request.skeleton, language: request.language) else { throw ExtractorUnavailable() }
        return try await extractor.extract(request)
    }
}

// MARK: - Samples

/// A built-in synthetic document (shared/samples/).
public struct SampleDocument: Sendable, Identifiable {
    public let id: String
    public let language: AppLocale
    /// Copy key of its name.
    public let titleKey: String
    public let text: Raw<String>

    static let catalog: [(id: String, language: AppLocale, titleKey: String)] = [
        ("paystub-en-01", .en, "doc.sample.enText"),
    ]
}

/// Not a model: fixed pointer answers for the built-in samples. It answers only when the
/// silhouette is exactly the silhouette of a sample in its language (no words hidden), so it can
/// never pretend to read a real document. Results carry `sampleAnswerKey` and the app labels them.
///
/// The answers come from shared/samples/answers.json. Used only for the bundled samples when there is
/// no network and no device model (routing.json `offlineSample`).
public struct SampleAnswerKeyExtractor: PointerExtractor {
    public struct Entry: Sendable {
        public let sampleId: String
        public let language: AppLocale
        public let skeleton: Skeleton
        public let pointers: JSON
    }

    public let entries: [Entry]
    public var destination: String { "this device (sample answers)" }

    /// Builds the key from the bundled samples: each sample's silhouette with its own language's
    /// allowlist and no hidden words.
    public init(bundle: SharedBundle) throws {
        entries = try bundle.samples.compactMap { sample in
            guard let pointers = bundle.sampleAnswers["samples"]?["\(sample.id).txt"]?["pointers"] else { return nil }
            let skeleton = Skeletonizer.skeletonize(sample.text, allowlist: try bundle.allowlist(for: sample.language)).skeleton
            return Entry(sampleId: sample.id, language: sample.language, skeleton: skeleton, pointers: pointers)
        }
    }

    public func canRead(_ skeleton: Skeleton, language: AppLocale) -> Bool {
        entries.contains { $0.skeleton.text.exactlyEquals(skeleton.text) && $0.language == language }
    }

    public func extract(_ request: PointerRequest) async throws -> PointerResult {
        guard let entry = entries.first(where: { $0.skeleton.text.exactlyEquals(request.skeleton.text) && $0.language == request.language })
        else { throw ExtractorUnavailable() }
        return PointerResult(pointers: entry.pointers, source: .sampleAnswerKey, reason: .sampleAnswerKey)
    }
}
