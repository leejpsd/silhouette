// App state: the Quick Check session, navigation, language, the outbound log and the encrypted
// store. Answers stay inside `Raw` (QuickCheckSession) and are saved encrypted after every change.

import Foundation
import Observation
import SilhouetteCore
import SilhouetteKit

enum Route: Hashable {
    /// `returnTo`: where to go after answering, when the question was opened from elsewhere.
    case question(String, returnTo: ReturnTo?)
    case results
    case program(String)
    case documentAdd
    case documentPreview
    case documentReview
}

enum ReturnTo: Hashable {
    case results
    case program(String)
    case documentAdd
    case documentPreview
    case documentReview
}

@MainActor
@Observable
final class AppModel {
    static let localeKey = "silhouette.locale"

    let bundle: SharedBundle
    let theme: Theme
    private(set) var session: QuickCheckSession
    var path: [Route] = []
    private(set) var locale: AppLocale
    private(set) var outbound: [OutboundEntry] = []
    /// A copy key shown once on the start screen (for example after deleting everything).
    var notice: String?
    /// The paystub in progress. Raw inside; saved only encrypted.
    private(set) var document: DocumentSession
    /// Verdicts that changed when the yearly income from a paystub was used.
    private(set) var incomeChange: [(program: String, before: Verdict, after: Verdict)]?
    /// Every pointer extractor available in this build. No model yet: only the sample answer key.
    @ObservationIgnored let extraction: PointerExtraction

    @ObservationIgnored private let store: AnswerStore
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var outboundObserver: UUID?

    init(bundle: SharedBundle, store: AnswerStore, defaults: UserDefaults = .standard, resetOnLaunch: Bool = false) throws {
        self.bundle = bundle
        self.theme = Theme(tokens: bundle.tokens)
        self.store = store
        self.defaults = defaults
        let steps = try QuickCheck.steps(pack: bundle.packInfo, bands: bundle.bands)
        if resetOnLaunch {
            try? store.deleteEverything()
            defaults.removeObject(forKey: Self.localeKey)
        }
        let saved = (try? store.load(steps: steps)) ?? Raw(QuickCheckAnswers())
        session = QuickCheckSession(steps: steps, answers: saved)
        let preferred = AppLocale.preferred(from: Locale.preferredLanguages)
        document = (try? store.loadDocument(schema: bundle.paystubSchema)) ?? DocumentSession(language: preferred)
        extraction = PointerExtraction(extractors: (try? SampleAnswerKeyExtractor(bundle: bundle)).map { [$0] } ?? [])
        locale = defaults.string(forKey: Self.localeKey).flatMap(AppLocale.init(rawValue:))
            ?? AppLocale.preferred(from: Locale.preferredLanguages)
        outbound = OutboundLog.shared.entries
        outboundObserver = OutboundLog.shared.observe { [weak self] entries in
            Task { @MainActor in self?.outbound = entries }
        }
    }

    // MARK: Copy

    func t(_ key: String, _ params: [String: String] = [:]) -> String {
        bundle.copy.text(key, locale, params)
    }

    func number(_ value: Double) -> String { CopyBook.formatNumber(value, locale) }

    func setLocale(_ newValue: AppLocale) {
        locale = newValue
        defaults.set(newValue.rawValue, forKey: Self.localeKey)
    }

    func programName(_ id: String) -> String {
        bundle.packInfo.program(id).map { bundle.copy.programName($0, locale) } ?? id
    }

    func variableName(_ variable: String) -> String { t("variable.\(variable)") }

    // MARK: Outbound log

    func outboundFieldName(_ field: String) -> String {
        bundle.copy.has("outbound.field.\(field)") ? t("outbound.field.\(field)") : field
    }

    /// "Nothing has left this device." or "{count} sent: {kinds}".
    var outboundSummary: String {
        guard !outbound.isEmpty else { return t("leaving.none") }
        var kinds: [String] = []
        for field in outbound.flatMap(\.fields) where !kinds.contains(field) { kinds.append(field) }
        return t("outbound.count", ["count": String(outbound.count), "list": kinds.map(outboundFieldName).joined(separator: ", ")])
    }

    // MARK: Results

    var results: [ProgramVerdict] {
        (try? session.verdicts(pack: bundle.pack, bands: bundle.bands)) ?? []
    }

    func result(_ programId: String) -> ProgramVerdict? { results.first { $0.programId == programId } }

    // MARK: Answers

    @discardableResult
    func answer(_ stepId: String, _ value: AnswerValue) -> AnswerProblem? {
        if let problem = session.answer(stepId, with: value) { return problem }
        persist()
        return nil
    }

    func skip(_ stepId: String) {
        session.skip(stepId)
        persist()
    }

    private func persist() {
        // A failed save leaves the answers in memory only; nothing is written in plain text.
        try? store.save(session.answers)
    }

    // MARK: Navigation

    private var firstStep: String { session.steps.first?.id ?? QuickCheck.incomeStep }

    func begin() {
        notice = nil
        guard session.isStarted else {
            path = [.question(firstStep, returnTo: nil)]
            return
        }
        let open = session.firstOpenIndex
        let asked = session.steps.prefix(open + (open < session.steps.count ? 1 : 0)).map { Route.question($0.id, returnTo: nil) }
        path = open < session.steps.count ? asked : asked + [.results]
    }

    func restart() {
        notice = nil
        session.reset()
        persist()
        path = [.question(firstStep, returnTo: nil)]
    }

    func editAnswers() {
        path = [.question(firstStep, returnTo: nil)]
    }

    /// After a question is answered or skipped.
    func advance(from stepId: String, returnTo: ReturnTo?) {
        if returnTo != nil {
            if !path.isEmpty { path.removeLast() }
            return
        }
        guard let index = session.index(of: stepId) else { return }
        if index + 1 < session.steps.count {
            path.append(.question(session.steps[index + 1].id, returnTo: nil))
        } else {
            path.append(.results)
        }
    }

    func openProgram(_ id: String) { path.append(.program(id)) }

    func answerDependency(_ variable: String, program: String) {
        path.append(.question(QuickCheck.step(forVariable: variable), returnTo: .program(program)))
    }

    // MARK: Delete everything

    func deleteEverything() {
        try? store.deleteEverything()
        defaults.removeObject(forKey: Self.localeKey)
        OutboundLog.shared.clear()
        outbound = []
        session.reset()
        document = DocumentSession(language: AppLocale.preferred(from: Locale.preferredLanguages))
        incomeChange = nil
        locale = AppLocale.preferred(from: Locale.preferredLanguages)
        path = []
        notice = "delete.done"
    }

    var hasSavedData: Bool { store.hasSavedData }

    // MARK: Document

    private func persistDocument() {
        try? store.saveDocument(document)
    }

    func openDocument() {
        incomeChange = nil
        path.append(.documentAdd)
    }

    func setDocumentLanguage(_ language: AppLocale) {
        document.setLanguage(language)
        persistDocument()
    }

    /// A new document from pasted, shared or PDF text, or a built-in sample.
    func useDocumentText(_ text: Raw<String>, source: DocumentSourceKind, sample: SampleDocument? = nil) {
        document.setText(text, source: source, sampleId: sample?.id, language: sample?.language)
        incomeChange = nil
        persistDocument()
        path.append(.documentPreview)
    }

    var silhouette: SkeletonResult? { try? document.silhouette(bundle: bundle) }

    func hideWord(_ word: String) {
        document.hide(word)
        persistDocument()
    }

    func unhideWord(_ word: String) {
        document.unhide(word)
        persistDocument()
    }

    /// The extractor that would read this silhouette, if any. Nothing is sent by asking.
    var documentExtractor: (any PointerExtractor)? {
        silhouette.flatMap { extraction.extractor(for: $0.skeleton, language: document.language) }
    }

    /// Reads the silhouette through the extraction path and opens the review.
    func readDocument() async {
        guard let silhouette else { return }
        do {
            let result = try await extraction.extract(PointerRequest(skeleton: silhouette.skeleton, language: document.language))
            document.apply(result, silhouette: silhouette, schema: bundle.paystubSchema)
        } catch {
            document.startManual(schema: bundle.paystubSchema)
        }
        persistDocument()
        path.append(.documentReview)
    }

    func typeNumbers() {
        document.startManual(schema: bundle.paystubSchema)
        persistDocument()
        if path.last != .documentReview { path.append(.documentReview) }
    }

    func editDocument(_ change: (inout DocumentSession) -> Void) {
        change(&document)
        persistDocument()
    }

    var documentValidation: ValidationResult? {
        try? document.validation(jurisdiction: bundle.packInfo.jurisdiction)
    }

    /// Uses the yearly income from the paystub as the exact Quick Check income, and records which
    /// verdicts changed.
    func useIncome(_ amount: Int) {
        let before = Dictionary(uniqueKeysWithValues: results.map { ($0.programId, $0.verdict) })
        answer(QuickCheck.incomeStep, .income(.exact(Double(amount))))
        incomeChange = results.compactMap { r in
            guard let b = before[r.programId], b != r.verdict else { return nil }
            return (r.programId, b, r.verdict)
        }
    }

    func addAnotherPaystub() {
        document.addAnother()
        incomeChange = nil
        persistDocument()
        path.append(.documentAdd)
    }

    func anotherDocument() {
        document.reset()
        persistDocument()
        if let i = path.lastIndex(of: .documentAdd) { path.removeSubrange((i + 1)...) } else { path.append(.documentAdd) }
    }

    func showResults() {
        let asked = session.steps.map { Route.question($0.id, returnTo: nil) }
        path = asked + [.results]
    }
}
