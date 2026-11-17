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
    /// The short path for judges (from the draft-rules sheet).
    case judges
    /// The on-device check (from the draft-rules sheet).
    case deviceCheck
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
    /// The rule pack people see (shared/rulepacks/us-ca, a labelled draft).
    static let jurisdiction = "us-ca"

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
    /// The sample answer key for the bundled samples (routing.json offlineSample).
    @ObservationIgnored let sampleKey: SampleAnswerKeyExtractor?
    /// Model access through Firebase AI Logic (or the scripted model in UI tests).
    @ObservationIgnored let port: any ModelPort
    @ObservationIgnored let runner: TaskRunner
    @ObservationIgnored let remoteConfig: RemoteConfigService
    @ObservationIgnored let network = NetworkMonitor()
    /// UI tests: `none`, `device` or `cloud` (no real model, no network).
    @ObservationIgnored let testModel: String?
    /// Explanations and questions of this session, consent and what has left (memory only).
    var answers = AnswerSession()
    var requests: [String: RequestState] = [:]
    @ObservationIgnored var pendingContent: [String: String] = [:]
    @ObservationIgnored var tasks: [String: Task<Void, Never>] = [:]

    /// The sheet over the screen (record, language, demo rules, delete, the step before sending).
    var sheet: AppSheet?
    /// The count the stamp last stamped in (it stamps once, when the count goes up).
    @ObservationIgnored var stampedCount = 0
    /// When the record of what left was deleted (memory only).
    private(set) var recordClearedAt: Date?
    /// UI tests: show the offline state.
    @ObservationIgnored var forceOffline = false
    /// The fast snapshot capture: open the on-device check running (`run`) or on its recording (`recording`).
    @ObservationIgnored var snapshotDeviceCheck: String?

    @ObservationIgnored private let store: AnswerStore
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var outboundObserver: UUID?

    init(bundle: SharedBundle, store: AnswerStore, defaults: UserDefaults = .standard, resetOnLaunch: Bool = false,
         testModel: String? = nil) throws {
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
        sampleKey = try? SampleAnswerKeyExtractor(bundle: bundle)
        self.testModel = testModel
        port = testModel.map { mode in
            TestModelPort(mode: mode, answerKeys: (try? SampleAnswerKeyExtractor(bundle: bundle))?.entries.map { ($0.skeleton.text, $0.pointers) } ?? [])
        } ?? FirebaseModelPort()
        let rc = RemoteConfigService(defaults: bundle.remoteConfigTemplate.map(AppConfig.defaultValues) ?? [:])
        remoteConfig = rc
        let log = OutboundLog.shared
        runner = TaskRunner(port: port, log: log, outputChecks: bundle.outputChecks,
                            firstRequestFields: testModel == nil ? ["app-check-token-request", "installation"] : [],
                            beforeCloudRequest: { await rc.fetchOnce(log: log) })
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

    /// Answers written on this device are recorded as `kept:{kind}`, named by what they answered.
    static let keptTitles = ["kept:document": "model.title", "kept:photo": "model.title", "kept:about": "about.title", "kept:ask": "ask.title"]

    func outboundFieldName(_ field: String) -> String {
        if let key = Self.keptTitles[field] { return t(key) }
        return bundle.copy.has("outbound.field.\(field)") ? t("outbound.field.\(field)") : field
    }

    /// "Nothing has left this device." or "{count} sent: {kinds}" (requests answered on this device
    /// are listed in the details but did not leave).
    var outboundSummary: String {
        let left = outbound.filter { if case .answeredOnDevice = $0.status { false } else { true } }
        guard !left.isEmpty else { return t("leaving.none") }
        var kinds: [String] = []
        for field in left.flatMap(\.fields) where !kinds.contains(field) { kinds.append(field) }
        return t("outbound.count", ["count": String(left.count), "list": kinds.map(outboundFieldName).joined(separator: ", ")])
    }

    /// Requests that left the device (`leaving.sentCount`).
    var sentCount: Int { outbound.filter { !$0.isAnsweredOnDevice }.count }
    /// Answers written on the device that never left (`leaving.keptCount`).
    var keptCount: Int { outbound.filter(\.isAnsweredOnDevice).count }

    /// The count row's subline: what left, or when the record was deleted, or nothing.
    var countSubline: String {
        if sentCount == 0, let cleared = recordClearedAt { return t("leaving.clearedShort", ["date": longDate(cleared)]) }
        return outboundSummary
    }

    /// Whether anything that left carried the profile silhouette (otherwise no answer or value left).
    var outboundCarriesProfile: Bool {
        outbound.contains { !$0.isAnsweredOnDevice && ($0.fields.contains("profile-silhouette") || $0.fields.contains("county-area")) }
    }

    /// The status line in the record: answered on the device has no host and no body.
    func recordStatus(_ entry: OutboundEntry) -> String {
        if case .answeredOnDevice = entry.status { return t("outbound.status.answeredShort") }
        return statusText(entry)
    }

    func time(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        f.setLocalizedDateFormatFromTemplate("HHmm")
        return f.string(from: date)
    }

    func shortDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        f.setLocalizedDateFormatFromTemplate("MMMd")
        return f.string(from: date)
    }

    func longDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }

    /// A date the pack writes as `YYYY-MM-DD`, in the UI language ("November 12, 2026").
    func packDate(_ iso: String) -> String {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = Calendar(identifier: .gregorian).date(from: DateComponents(
            timeZone: TimeZone(identifier: "UTC"), year: parts[0], month: parts[1], day: parts[2])) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateStyle = .long
        return f.string(from: date)
    }

    /// A program's period as the pack writes it ("Tax year 2025", "October 1, 2026 - September 30,
    /// 2027"), in the UI language. Anything else is shown as written.
    func packPeriod(_ period: String) -> String {
        if let m = period.wholeMatch(of: /Tax year (\d{4})/) { return t("period.taxYear", ["year": String(m.1)]) }
        if let m = period.wholeMatch(of: /([A-Z][a-z]+ \d{1,2}, \d{4}) - ([A-Z][a-z]+ \d{1,2}, \d{4})/) {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = TimeZone(identifier: "UTC")
            f.dateFormat = "MMMM d, yyyy"
            let out = DateFormatter()
            out.locale = Locale(identifier: locale.rawValue)
            out.timeZone = TimeZone(identifier: "UTC")
            out.dateStyle = .long
            let day = { (s: Substring) in f.date(from: String(s)).map(out.string(from:)) ?? String(s) }
            return "\(day(m.1)) – \(day(m.2))"
        }
        return period
    }

    /// The draft notice line: "Draft rules, read November 12, 2026."
    var draftDate: String { bundle.packInfo.sourcesReadOn.map(packDate) ?? "" }

    /// A document amount as the jurisdiction's paperwork writes it (the pack's number format), with
    /// decimals only when it has them.
    func documentAmount(_ value: Double) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: bundle.packInfo.numberFormat ?? locale.rawValue)
        f.numberStyle = .decimal
        f.usesGroupingSeparator = true
        let whole = value.rounded() == value
        f.minimumFractionDigits = whole ? 0 : 2
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: value)) ?? String(value)
    }

    /// Money in the pack's currency, written in the pack's number format.
    func money(_ value: Double, cents: Bool = false) -> String {
        CopyBook.formatMoney(value, locale, currency: bundle.packInfo.currency, format: bundle.packInfo.numberFormat, cents: cents)
    }

    func statusText(_ entry: OutboundEntry) -> String {
        switch entry.status {
        case .attempted: t("outbound.status.attempted")
        case .sent(let status): t("outbound.status.sent", ["status": String(status)])
        case .failed(let reason): t("outbound.status.failed", ["reason": reason])
        case .answeredOnDevice: t("outbound.status.answeredOnDevice")
        }
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

    /// Clears the answers without moving (the judges' prepared household starts from nothing).
    func restartForDemo() {
        notice = nil
        session.reset()
        persist()
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
        for task in tasks.values { task.cancel() }
        tasks = [:]
        requests = [:]
        answers.clear()
        session.reset()
        document = DocumentSession(language: AppLocale.preferred(from: Locale.preferredLanguages))
        incomeChange = nil
        locale = AppLocale.preferred(from: Locale.preferredLanguages)
        path = []
        sheet = nil
        stampedCount = 0
        recordClearedAt = Date()
        notice = "delete.done"
    }

    /// A clean state without the "deleted" notice (the fast snapshot capture starts each scene here).
    func resetForSnapshot(locale newLocale: AppLocale) {
        deleteEverything()
        notice = nil
        recordClearedAt = nil
        setLocale(newLocale)
    }

    /// The wordmark: back to the start.
    func goHome() {
        sheet = nil
        path = []
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

    /// Whether a model can be reached: the device model, or the network with a Firebase configuration.
    var deviceModelAvailable: Bool { port.deviceAvailability() == .available }
    var isOnline: Bool { testModel.map { $0.hasPrefix("cloud") || $0 == "device-unreliable" } ?? (network.isOnline && FirebaseServices.isConfigured) }

    /// The reader for this silhouette: a model when one can be reached; otherwise, for a bundled sample
    /// only, its answer key (routing.json offlineSample); otherwise none.
    var documentExtractor: (any PointerExtractor)? {
        guard let silhouette else { return nil }
        if deviceModelAvailable || isOnline { return modelExtractor }
        if let key = sampleKey, key.canRead(silhouette.skeleton, language: document.language) { return key }
        return nil
    }

    var modelExtractor: ModelPointerExtractor? {
        guard let template = pointerTemplate(version: lastConfig?.promptPointerExtractV ?? currentConfig.promptPointerExtractV) else { return nil }
        return ModelPointerExtractor(runner: runner, template: template, schema: bundle.paystubSchema, canRun: { true })
    }

    @ObservationIgnored var lastConfig: AppConfig?
    var documentError: TaskError?

    /// The step a reading is on, for the status line while the device reads (DEVICE_READING.md section 7).
    var readingStage: ReadingStage?

    /// The pointer prompt for the Remote Config version (an unknown version means the newest bundled one).
    func pointerTemplate(version: Int?) -> PromptTemplate? {
        bundle.prompts.versioned("pointer-extract", version: version, among: 2...5)
    }

    /// Reads the silhouette and opens the review.
    /// - A bundled sample with no model and no network: its answer key (nothing is sent).
    /// - Otherwise a model through Firebase AI Logic: on a device whose model is available, a paystub is
    ///   read in parts when Remote Config says 5 or more (pointer-extract v5), every answer checked.
    /// - `keepOnDevice`: the person chose to keep everything on this device. The device reads it when
    ///   it has a model; nothing is sent, and a reading that does not hold up fills in nothing.
    func readDocument(keepOnDevice: Bool = false) async {
        guard let silhouette, let extractor = documentExtractor ?? (keepOnDevice && deviceModelAvailable ? modelExtractor : nil) else { return }
        documentError = nil
        readingStage = nil
        defer { readingStage = nil }
        if !(extractor is ModelPointerExtractor) {
            do {
                let result = try await extractor.extract(PointerRequest(skeleton: silhouette.skeleton, language: document.language))
                document.apply(result, silhouette: silhouette, schema: bundle.paystubSchema)
            } catch {
                documentError = (error as? TaskError) ?? TaskError(.unknown, "extraction")
                return
            }
            persistDocument()
            path.append(.documentReview)
            return
        }
        // Remote Config is fetched before the first cloud request only; keeping everything on the device sends nothing.
        if !keepOnDevice {
            await remoteConfig.fetchOnce(log: OutboundLog.shared)
            lastConfig = await remoteConfig.current()
        }
        let version = lastConfig?.promptPointerExtractV ?? currentConfig.promptPointerExtractV
        guard let template = pointerTemplate(version: version),
              let request = try? Planner.pointers(silhouette.skeleton, language: document.language, template: template, pointerSchema: bundle.paystubSchema)
        else { documentError = TaskError(.unknown, "no pointer prompt"); return }
        let inParts: ReadingInParts? = template.id == "pointer-extract.v5" && version >= 5 && !bundle.prompts.deviceParts.isEmpty
            ? ReadingInParts(template: template, parts: bundle.prompts.deviceParts, schema: bundle.paystubSchema, skeleton: silhouette.skeleton,
                             map: silhouette.map, jurisdiction: bundle.packInfo.jurisdiction)
            : nil
        do {
            let outcome = try await runner.extractPointers(request, inParts: inParts, keepOnDevice: keepOnDevice) { stage in
                Task { @MainActor [weak self] in self?.readingStage = stage }
            }
            if outcome.source == .inCloud { answers.markSent(silhouette.skeleton.text) }
            lastDeviceAttempt = outcome.attempt
            document.apply(PointerResult(pointers: outcome.pointers, source: outcome.source, reason: outcome.reason, notRead: outcome.notRead),
                           silhouette: silhouette, schema: bundle.paystubSchema)
        } catch let failed as DeviceReadingFailed {
            lastDeviceAttempt = failed.attempt
            documentError = failed.error
            return
        } catch {
            documentError = (error as? TaskError) ?? TaskError(.unknown, "extraction")
            return
        }
        persistDocument()
        path.append(.documentReview)
    }

    /// What the device answered in the last reading, part by part (placeholder ids only).
    @ObservationIgnored var lastDeviceAttempt: DeviceAttempt?

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
