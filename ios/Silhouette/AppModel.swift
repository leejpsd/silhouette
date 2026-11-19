// App state: the Quick Check session, navigation, language, the outbound log and the encrypted
// store. Answers stay inside `Raw` (QuickCheckSession) and are saved encrypted after every change.

import Foundation
import Observation
import SilhouetteCore
import SilhouetteKit

/// The three tabs (DESIGN.md section 6): the Quick Check, the results, the paystub.
enum AppTab: Hashable { case check, results, paystub }

/// A screen pushed on a tab's stack. Each tab's root is its own screen (Start, Results, Add a paystub).
enum Route: Hashable {
    /// `returnTo`: where to go after answering, when the question was opened from elsewhere.
    case question(String, returnTo: ReturnTo?)
    case program(String)
    case documentPreview
    case documentReview
    /// The short path for judges (from the start screen and the draft-rules sheet).
    case judges
    /// The on-device check (from the judges' page and the draft-rules sheet).
    case deviceCheck
    /// Where each task runs (from the judges' page and the draft-rules sheet).
    case tasks
    /// A question about a program and its answer, by request key.
    case answer(String)
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
    /// Where the person is: the selected tab and each tab's stack (one source of truth).
    var tab: AppTab = .check
    var checkPath: [Route] = []
    var resultsPath: [Route] = []
    var paystubPath: [Route] = []

    /// The stack of the selected tab.
    var path: [Route] {
        get {
            switch tab {
            case .check: checkPath
            case .results: resultsPath
            case .paystub: paystubPath
            }
        }
        set {
            switch tab {
            case .check: checkPath = newValue
            case .results: resultsPath = newValue
            case .paystub: paystubPath = newValue
            }
        }
    }

    /// The pack's currency symbol ("$" for USD), written in the pack's number format.
    var currencySymbol: String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: bundle.packInfo.numberFormat ?? "en-US")
        f.currencyCode = bundle.packInfo.currency ?? "USD"
        return f.currencySymbol ?? "$"
    }

    /// The program and the question of each request about a program, for its answer screen.
    @ObservationIgnored var answerContext: [String: (program: String, question: String)] = [:]

    /// Shows the answer screen of a request (on the results tab, above the program's page).
    func openAnswer(_ key: String) {
        guard path.last != .answer(key) else { return }
        path.append(.answer(key))
    }

    /// Goes back one screen in the selected tab.
    func back() { if !path.isEmpty { path.removeLast() } }
    private(set) var locale: AppLocale
    private(set) var outbound: [OutboundEntry] = []
    /// A copy key shown once on the start screen (for example after deleting everything).
    var notice: String?
    /// What was chosen on a question but not submitted, kept when the person leaves it by Back, so
    /// coming forward again shows the same choice (shared/design/DESIGN.md section 8).
    var questionDrafts: [String: QuestionDraft] = [:]
    /// The judges' path is under way (their Quick Check ran): each screen names the next step.
    var onJudgesPath = false
    /// The paystub in progress. Raw inside; saved only encrypted.
    private(set) var document: DocumentSession
    /// Verdicts that changed when the yearly income from a paystub was used.
    private(set) var incomeChange: [(program: String, before: Verdict, after: Verdict)]?
    /// What the paystub did to the answers when its yearly income was used (results.docEffect.*): kept
    /// while the income answer is still that amount.
    private(set) var documentEffect: DocumentEffect?
    /// The recorded cloud readings bundled with the app (routing.json `recordedCloud`), newest first.
    @ObservationIgnored let cloudRecordings: [RecordedCloudReading]
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
    /// `-DeviceCheckRun`: the on-device check starts by itself with this many repetitions.
    @ObservationIgnored var autoRunDeviceCheck: Int?

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
        document = (try? store.loadDocument(schema: bundle.paystubSchema)).flatMap { AppLocale.offered.contains($0.language) ? $0 : nil }
            ?? DocumentSession(language: preferred)
        sampleKey = try? SampleAnswerKeyExtractor(bundle: bundle)
        cloudRecordings = RecordedCloudReading.load(directory: bundle.directory.appendingPathComponent("recordings/cloud", isDirectory: true))
        self.testModel = testModel
        port = testModel.map { mode in
            TestModelPort(mode: mode, answerKeys: ((try? SampleAnswerKeyExtractor(bundle: bundle))?.entries.map { ($0.skeleton.text, $0.pointers) } ?? [])
                + TestModelPort.checkAnswers(bundle))
        } ?? FirebaseModelPort()
        let rc = RemoteConfigService(defaults: bundle.remoteConfigTemplate.map(AppConfig.defaultValues) ?? [:])
        remoteConfig = rc
        let log = OutboundLog.shared
        runner = TaskRunner(port: port, log: log, outputChecks: bundle.outputChecks,
                            afterCloudRequest: { await rc.fetchOnce(log: log) })
        locale = defaults.string(forKey: Self.localeKey).flatMap(AppLocale.init(rawValue:)).flatMap { AppLocale.offered.contains($0) ? $0 : nil }
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

    /// The line under the count (shared/RECORD.md section 4): what carried something of the person's,
    /// then the rest, adding up to the number that left; "Nothing has left this iPhone." when none did.
    /// Answers written on the device and requests stopped before they left are not counted.
    var outboundSummary: String {
        let parts = OutboundLog.split(outbound)
        guard !parts.isEmpty else { return t("leaving.none") }
        return parts.map { t($0.key, ["count": number(Double($0.count))]) }.joined(separator: " · ")
    }

    /// Requests that left the device (`leaving.sentCount`): attempted, sent or not completed.
    var sentCount: Int { outbound.filter(\.left).count }
    /// Requests that left and did not complete (`leaving.notCompleted`).
    var notCompletedCount: Int { outbound.filter { if case .failed = $0.status { true } else { false } }.count }
    /// Answers written on the device that never left (`leaving.keptCount`).
    var keptCount: Int { outbound.filter { $0.isAnsweredOnDevice || $0.isRecorded }.count }

    /// The count row's subline: what left, or when the record was deleted, or nothing.
    var countSubline: String {
        if sentCount == 0, let cleared = recordClearedAt { return t("leaving.clearedShort", ["date": longDate(cleared)]) }
        return outboundSummary
    }

    /// Whether anything that left carried the profile silhouette (otherwise no answer or value left).
    var outboundCarriesProfile: Bool {
        outbound.contains { $0.left && ($0.fields.contains("profile-silhouette") || $0.fields.contains("county-area")) }
    }

    /// The status line in the record: answered on the device has no host and no body.
    func recordStatus(_ entry: OutboundEntry) -> String {
        if case .answeredOnDevice = entry.status { return t("outbound.status.answeredShort") }
        return statusText(entry)
    }

    func time(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        // The locale's own clock (12-hour with AM/PM in en_US), as everywhere else in the app.
        f.setLocalizedDateFormatFromTemplate("jmm")
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

    /// The document reading request exactly as the app would build it for the cloud (the silhouette and
    /// nothing else), for "Show the request" on the silhouette screen.
    var documentRequestText: String? {
        guard let silhouette, let template = pointerTemplate(version: currentConfig.promptPointerExtractV),
              let request = try? Planner.pointers(silhouette.skeleton, language: document.language, template: template, pointerSchema: bundle.paystubSchema)
        else { return nil }
        return request.rendering.text
    }

    /// A date the pack writes as `YYYY-MM-DD`, in the UI language ("November 12, 2026").
    func packDate(_ iso: String) -> String { packDate(iso, style: .long) }

    /// The same, as a short date ("Oct 15, 2026").
    func mediumDate(_ iso: String) -> String { packDate(iso, style: .medium) }

    func packDate(_ iso: String, style: DateFormatter.Style) -> String {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = Calendar(identifier: .gregorian).date(from: DateComponents(
            timeZone: TimeZone(identifier: "UTC"), year: parts[0], month: parts[1], day: parts[2])) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateStyle = style
        // A date never breaks across lines ("November / 12, 2026"): no-break spaces inside it.
        return f.string(from: date).replacingOccurrences(of: " ", with: "\u{00A0}")
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
    /// The date a checked pack's numbers were compared with their sources.
    var checkedDate: String { bundle.packInfo.verifiedOn.map(packDate) ?? "" }
    /// The rules line and its sheet title: checked, draft or demo.
    var rulesShort: String {
        let info = bundle.packInfo
        return info.isChecked ? t("pack.checked.short", ["date": checkedDate]) : info.isDraft ? t("pack.draft.short", ["date": draftDate]) : t("demo.short")
    }
    var rulesTitle: String {
        let info = bundle.packInfo
        return t(info.isChecked ? "pack.checked.title" : info.isDraft ? "pack.draft.title" : "demo.title")
    }

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
        case .blocked(let reason): t(reason == "noAppCheck" ? "outbound.status.noAppCheck" : "outbound.status.blocked")
        case .answeredOnDevice: t("outbound.status.answeredOnDevice")
        case .recorded: t("record.recordedCloud.status")
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
        tab = .check
        guard session.isStarted else {
            checkPath = [.question(firstStep, returnTo: nil)]
            return
        }
        let open = session.firstOpenIndex
        guard open < session.steps.count else { showResults(); return }
        checkPath = session.steps.prefix(open + 1).map { Route.question($0.id, returnTo: nil) }
    }

    func restart() {
        notice = nil
        documentEffect = nil
        session.reset()
        persist()
        tab = .check
        checkPath = [.question(firstStep, returnTo: nil)]
    }

    /// Clears the answers without moving (the judges' prepared household starts from nothing).
    func restartForDemo() {
        notice = nil
        documentEffect = nil
        session.reset()
        persist()
    }

    func editAnswers() {
        tab = .check
        checkPath = [.question(firstStep, returnTo: nil)]
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
            showResults()
        }
    }

    /// A program's page, on the results tab.
    func openProgram(_ id: String) {
        if tab != .results { tab = .results; resultsPath = [] }
        resultsPath.append(.program(id))
    }

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
        documentEffect = nil
        readingShow = nil
        locale = AppLocale.preferred(from: Locale.preferredLanguages)
        tab = .check
        checkPath = []
        resultsPath = []
        paystubPath = []
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
        tab = .check
        checkPath = []
    }

    var hasSavedData: Bool { store.hasSavedData }

    // MARK: Document

    private func persistDocument() {
        try? store.saveDocument(document)
    }

    /// The paystub tab at its start (Add a paystub).
    func openDocument() {
        incomeChange = nil
        tab = .paystub
        paystubPath = []
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
        tab = .paystub
        paystubPath = [.documentPreview]
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
    /// - `review`: open the review when the reading is in (the judges' one press goes on to the results itself).
    /// - Returns: whether the reading is in.
    @discardableResult
    func readDocument(keepOnDevice: Bool = false, review: Bool = true) async -> Bool {
        guard let silhouette, let extractor = documentExtractor ?? (keepOnDevice && deviceModelAvailable ? modelExtractor : nil) else { return false }
        documentError = nil
        readingStage = nil
        defer { readingStage = nil }
        if !(extractor is ModelPointerExtractor) {
            do {
                let result = try await extractor.extract(PointerRequest(skeleton: silhouette.skeleton, language: document.language))
                document.apply(result, silhouette: silhouette, schema: bundle.paystubSchema)
            } catch {
                documentError = (error as? TaskError) ?? TaskError(.unknown, "extraction")
                return false
            }
            persistDocument()
            if review { await arriveAtReview() }
            return true
        }
        // Remote Config is fetched after the first cloud request (shared/RECORD.md section 1); until then the
        // bundled defaults apply. Keeping everything on the device sends nothing.
        // The reading is shown as it happens (contract v1.43): the silhouette going to the model on this
        // device first when it has one, otherwise to the cloud.
        beginShow(keepOnDevice || deviceModelAvailable ? .device : .cloud(afterDevice: false))
        lastConfig = await remoteConfig.current()
        let version = lastConfig?.promptPointerExtractV ?? currentConfig.promptPointerExtractV
        guard let template = pointerTemplate(version: version),
              let request = try? Planner.pointers(silhouette.skeleton, language: document.language, template: template, pointerSchema: bundle.paystubSchema)
        else { readingShow = nil; documentError = TaskError(.unknown, "no pointer prompt"); return false }
        let inParts: ReadingInParts? = template.id == "pointer-extract.v5" && version >= 5 && !bundle.prompts.deviceParts.isEmpty
            ? ReadingInParts(template: template, parts: bundle.prompts.deviceParts, schema: bundle.paystubSchema, skeleton: silhouette.skeleton,
                             map: silhouette.map, jurisdiction: bundle.packInfo.jurisdiction, language: document.language.rawValue)
            : nil
        do {
            let outcome = try await runner.extractPointers(request, inParts: inParts, keepOnDevice: keepOnDevice) { stage in
                Task { @MainActor [weak self] in
                    self?.readingStage = stage
                    // This device could not read it reliably: the silhouette now goes to the cloud.
                    if stage == .sendingAfterDevice { self?.beginShow(.cloud(afterDevice: true)) }
                }
            }
            if outcome.source == .inCloud { answers.markSent(silhouette.skeleton.text) }
            lastDeviceAttempt = outcome.attempt
            document.apply(PointerResult(pointers: outcome.pointers, source: outcome.source, reason: outcome.reason, notRead: outcome.notRead),
                           silhouette: silhouette, schema: bundle.paystubSchema)
            // The way it really went decides what comes back (a reading the runner sent on to the cloud).
            if outcome.source == .inCloud, readingShow?.route == .device { readingShow?.route = .cloud(afterDevice: true) }
        } catch let failed as DeviceReadingFailed {
            // An error is never delayed by the staging.
            readingShow = nil
            lastDeviceAttempt = failed.attempt
            documentError = failed.error
            return false
        } catch {
            readingShow = nil
            documentError = (error as? TaskError) ?? TaskError(.unknown, "extraction")
            return false
        }
        persistDocument()
        await pointersBack(silhouette)
        if review { await arriveAtReview() }
        return true
    }

    /// The reading came back: the review arrives with the standard push. After a reading by a model the
    /// staging has already shown the placeholders coming back and turning into values; it is cleared once
    /// the review covers it. Otherwise (the sample's answer key) the stage line says it is being checked for
    /// a moment. Not in snapshots.
    private func arriveAtReview() async {
        if readingShow != nil {
            paystubPath.append(.documentReview)
            try? await Task.sleep(for: .milliseconds(450))
            readingShow = nil
            return
        }
        if !MotionSwitch.off {
            readingStage = .checking
            try? await Task.sleep(for: .milliseconds(450))
        }
        paystubPath.append(.documentReview)
    }

    // MARK: The reading shown as it happens

    /// The silhouette shown going to the model, and the answer coming back (contract v1.43).
    var readingShow: ReadingShow?
    /// The shortest time the silhouette is shown going out, and how long the placeholders take to come back
    /// and turn into values. Together at most about 2.3 s added; a reading by a model that takes longer
    /// than the first adds only the second.
    static let showOut: Double = 0.9
    static let showBack: Double = 1.4
    /// UI tests hold each stage longer: the test runner takes a few tenths of a second per query.
    private var showOutTime: Double { testModel != nil ? 3 : Self.showOut }
    private var showBackTime: Double { testModel != nil ? 4 : Self.showBack }

    private func beginShow(_ route: ReadingShow.Route) {
        guard !MotionSwitch.off else { return }
        // UI tests: the chips are drawn still (a running animation keeps the app from ever being idle for
        // the test runner, which then sees the staging only after it has gone).
        readingShow = ReadingShow(route: route, still: testModel != nil ? 0.3 : nil)
    }

    /// The answer is in: the silhouette has been seen going out for at least `showOut`, then the placeholders
    /// come back and turn into the values on this device for `showBack`.
    private func pointersBack(_ silhouette: SkeletonResult) async {
        guard let show = readingShow else { return }
        let shown = Date().timeIntervalSince(show.since)
        if shown < showOutTime { try? await Task.sleep(for: .seconds(showOutTime - shown)) }
        guard readingShow != nil else { return }
        readingShow = ReadingShow(route: show.route, phase: .back, pairs: ReadingShow.pairs(document, silhouette: silhouette), still: show.still)
        try? await Task.sleep(for: .seconds(showBackTime))
    }

    /// What the device answered in the last reading, part by part (placeholder ids only).
    @ObservationIgnored var lastDeviceAttempt: DeviceAttempt?

    func typeNumbers() {
        document.startManual(schema: bundle.paystubSchema)
        persistDocument()
        tab = .paystub
        if paystubPath.last != .documentReview { paystubPath.append(.documentReview) }
    }

    func editDocument(_ change: (inout DocumentSession) -> Void) {
        change(&document)
        persistDocument()
    }

    var documentValidation: ValidationResult? {
        try? document.validation(jurisdiction: bundle.packInfo.jurisdiction)
    }

    /// Uses the yearly income from the paystub as the exact Quick Check income, records which verdicts
    /// changed, and opens the results. Wages are money from work: a paystub also answers that question
    /// with yes when it was not already (contract v1.40).
    func useIncome(_ annualization: ValidationResult.Annualization) {
        let amount = annualization.annualIncome
        let before = Dictionary(uniqueKeysWithValues: results.map { ($0.programId, $0.verdict) })
        var filled = ["annualIncome"]
        if session.step(Self.earnedIncomeStep) != nil, session.displayAnswer(for: Self.earnedIncomeStep) != .value(.choice("yes")) {
            answer(Self.earnedIncomeStep, .choice("yes"))
            filled.append(Self.earnedIncomeStep)
        }
        answer(QuickCheck.incomeStep, .income(.exact(Double(amount))))
        let changed = results.compactMap { r -> (program: String, before: Verdict, after: Verdict)? in
            guard let b = before[r.programId], b != r.verdict else { return nil }
            return (r.programId, b, r.verdict)
        }
        incomeChange = changed
        // Read from the document (not typed): the results say how it was read and what it changed.
        documentEffect = document.extraction.map { e in
            DocumentEffect(source: e.source, amount: amount, annualization: annualization, filled: filled, changed: changed)
        }
        showResults()
    }

    /// The question "Does anyone in the household earn money from work?".
    static let earnedIncomeStep = "hasEarnedIncome"

    /// What the paystub changed, while the income answer is still the amount it gave.
    var currentDocumentEffect: DocumentEffect? {
        guard let effect = documentEffect, session.displayAnswer(for: QuickCheck.incomeStep) == .value(.income(.exact(Double(effect.amount))))
        else { return nil }
        return effect
    }

    /// Whether the answers are the prepared household's (judges' path), not the person's own. The yearly
    /// income and money from work are left out of the comparison: a paystub read on the way may have
    /// answered them.
    var isSampleHousehold: Bool {
        let prepared = (bundle.judgesHousehold?.answers ?? []).filter {
            $0.0 != QuickCheck.incomeStep && $0.0 != Self.earnedIncomeStep && session.step($0.0) != nil
        }
        return !prepared.isEmpty && prepared.allSatisfy { session.displayAnswer(for: $0.0) == .value($0.1) }
    }

    // MARK: Recorded cloud reading

    /// The recorded cloud reading of this silhouette: only the bundled English sample with nothing hidden.
    var recordedCloudReading: RecordedCloudReading? {
        guard let silhouette else { return nil }
        return RecordedCloudReading.matching(cloudRecordings, skeleton: silhouette.skeleton, language: document.language, key: sampleKey)
    }

    /// routing.json `recordedCloud`: the recording's placeholder ids are the reading; the values are put
    /// back on this device now and nothing is sent. The record lists it as kept, with the exact request as
    /// it was sent when it was recorded, and the answer.
    @discardableResult
    func useRecordedCloud(review: Bool = true) async -> Bool {
        guard let silhouette, let recording = recordedCloudReading else { return false }
        documentError = nil
        // Shown as a cloud reading, labelled as a recording: nothing is sent now.
        beginShow(.recordedCloud)
        document.apply(recording.result, silhouette: silhouette, schema: bundle.paystubSchema, recordedDate: recording.date)
        OutboundLog.shared.record(OutboundEntry(
            channel: .aiCloud, destination: TaskRunner.cloudDestination, fields: ["document-silhouette"], status: .recorded,
            model: recording.model,
            recording: .init(date: recording.date, endpoint: recording.endpoint, body: recording.requestBody, answer: recording.answer,
                             model: recording.model)))
        persistDocument()
        await pointersBack(silhouette)
        if review { await arriveAtReview() }
        return true
    }

    /// An ISO date-time as a medium date in the UI language ("Nov 19, 2026").
    func recordedDay(_ iso: String) -> String { mediumDate(String(iso.prefix(10))) }

    func addAnotherPaystub() {
        document.addAnother()
        incomeChange = nil
        persistDocument()
        tab = .paystub
        paystubPath = []
    }

    func anotherDocument() {
        document.reset()
        persistDocument()
        tab = .paystub
        paystubPath = []
    }

    /// The results tab at its start; the Quick Check tab goes back to its start.
    func showResults() {
        tab = .results
        resultsPath = []
        checkPath = []
    }

    /// A page of the check tab (judges, on-device check, where each task runs), from anywhere.
    func open(_ route: Route) {
        sheet = nil
        tab = .check
        checkPath = [route]
    }
}
