// Sheets: system sheets on the ground colour with a grab handle, a glass close
// button and a centred sentence-case title; white cards inside. Used for the record of what left this
// device, the step before sending, the language, the draft rules and "Delete everything".

import SilhouetteCore
import SilhouetteKit
import SwiftUI

enum AppSheet: Equatable, Identifiable {
    case record
    case language
    case demo
    /// The confirmation; `back` is the sheet it was opened from.
    case delete(back: Back)
    /// The step before sending, for the request with this key.
    case send(String)

    enum Back: Equatable { case record, demo }

    var id: String {
        switch self {
        case .record: "record"
        case .language: "language"
        case .demo: "demo"
        case .delete: "delete"
        case .send(let key): "send-\(key)"
        }
    }

    var isSend: Bool { if case .send = self { true } else { false } }
}

extension AppModel {
    /// Closing a sheet: the step before sending sends nothing; the delete confirmation goes back.
    func closeSheet(_ closing: AppSheet) {
        switch closing {
        case .send(let key):
            keepOnDevice(key)
            if sheet == closing { sheet = nil }
        case .delete(let back):
            sheet = back == .record ? .record : .demo
        default:
            if sheet == closing { sheet = nil }
        }
    }
}

/// Presents the model's sheet as a system sheet.
struct SheetHost: ViewModifier {
    @Environment(AppModel.self) private var model

    func body(content: Content) -> some View {
        content.sheet(item: Binding(get: { model.sheet }, set: { new in
            if new == nil, let open = model.sheet { model.closeSheet(open) }
        })) { sheet in
            SheetPanel(sheet: sheet)
                .environment(model)
                .environment(\.theme, model.theme)
                .environment(\.locale, Locale(identifier: model.locale.rawValue))
        }
    }
}

private struct SheetPanel: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    let sheet: AppSheet

    var body: some View {
        NavigationStack {
            RevealingScroll {
                VStack(alignment: .leading, spacing: 16) {
                    content
                    // At accessibility sizes the actions follow the text (pinned, they covered it).
                    if dynamicType.isAccessibilitySize { footer.padding(.horizontal, -16) }
                }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .background(theme.ground.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { model.closeSheet(sheet) } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(sheet == .record ? model.t("leaving.hide") : model.t("nav.close"))
                        .accessibilityIdentifier(sheet == .record ? "leaving.hide" : "sheet.close")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { if !dynamicType.isAccessibilitySize { footer } }
        }
        // Short sheets open at half height, except at accessibility sizes, where their text would be cut.
        .presentationDetents((sheet == .language || sheet.isDelete) && !dynamicType.isAccessibilitySize ? [.medium, .large] : [.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.ground)
        .accessibilityIdentifier(sheet.isSend ? "send.panel" : "sheet")
    }

    private var title: String {
        switch sheet {
        case .record: model.t("leaving.title")
        case .send: model.t("send.beforeLeaves")
        case .language: model.t("nav.language")
        // The sheet's own headline names it; the bar does not repeat it.
        case .demo: ""
        case .delete: model.t("delete.all")
        }
    }

    @ViewBuilder private var content: some View {
        switch sheet {
        case .record: RecordSheet()
        case .language: LanguageSheet()
        case .demo: DemoSheet()
        case .delete: DeleteSheet()
        case .send(let key): SendSheet(key: key)
        }
    }

    @ViewBuilder private var footer: some View {
        switch sheet {
        case .delete:
            SheetFooter {
                PrimaryButton(label: model.t("delete.confirm"), id: "delete.confirm") { model.deleteEverything() }
                SecondaryButton(label: model.t("delete.cancel"), id: "delete.cancel") { model.closeSheet(sheet) }
            }
        case .send(let key):
            if case .confirm(let request, let lines) = model.state(key) {
                SendFooter(key: key, request: request, lines: lines)
            }
        default:
            EmptyView()
        }
    }
}

extension AppSheet {
    var isDelete: Bool { if case .delete = self { true } else { false } }
}

/// The actions at the foot of a sheet, on the ground.
struct SheetFooter<Content: View>: View {
    @Environment(\.theme) private var theme
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 8) { content }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .background(theme.ground)
    }
}

// MARK: - Record of what left this device

private struct RecordSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        let entries = model.outbound
        headline
        if entries.isEmpty, let cleared = model.recordClearedAt {
            SectionLabel(text: model.t("leaving.recordDeleted", ["date": model.shortDate(cleared)]), large: false)
            NoteText(text: model.t("leaving.cleared", ["date": model.longDate(cleared)]), size: 15)
        } else if model.sentCount == 0 {
            NoteText(text: model.t("leaving.body"), size: 15)
        } else {
            NoteText(text: model.t("leaving.bodySent"), size: 15)
        }
        if model.notCompletedCount > 0 {
            NoteText(text: model.t("leaving.notCompleted", ["count": model.number(Double(model.notCompletedCount))]), size: 15)
                .accessibilityIdentifier("leaving.notCompleted")
        }
        if !entries.isEmpty {
            if let cleared = model.recordClearedAt { NoteText(text: model.t("leaving.cleared", ["date": model.longDate(cleared)])) }
            // The latest request opens on what left, in plain words; the exact request is one press further.
            let latestId = entries.max(by: { $0.at < $1.at }).map(\.id)
            ListCard {
                ForEach(Array(entries.enumerated()), id: \.element.id) { i, entry in
                    if i > 0 { RowDivider(inset: 0) }
                    RecordEntry(entry: entry, latest: entry.id == latestId)
                }
            }
        }
        MoreAbout {
            NoteText(text: model.t("leaving.sdkNote"))
            NoteText(text: model.t("leaving.network"))
        }
        Button { model.sheet = .delete(back: .record) } label: {
            Label(model.t("delete.all"), systemImage: "trash")
                .sfFont(17, weight: .semibold)
                .foregroundStyle(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(theme.sheet))
        }
        .buttonStyle(PressScale())
        .accessibilityIdentifier("delete.all")
    }

    /// The headline in plain words (contract v1.44): "Nothing has left this iPhone", or "1 request left this
    /// iPhone" (the count on a redact block) with "Each carried only a silhouette" under it; then what was
    /// answered here and the recordings shown, counted.
    private var headline: some View {
        let sent = model.sentCount
        let title = sent == 0 ? model.t("leaving.headline.none")
            : model.t("leaving.headline.sent", ["count": model.number(Double(sent))])
        let answered = model.outbound.filter(\.isAnsweredOnDevice).count
        let recorded = model.outbound.filter(\.isRecorded).count
        let sub = [answered > 0 ? model.t("leaving.sub.kept", ["count": model.number(Double(answered))]) : nil,
                   recorded > 0 ? model.t("leaving.sub.recorded", ["count": model.number(Double(recorded))]) : nil].compactMap { $0 }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                CounterDisc(count: sent, size: 44)
                Display(text: title, size: 40, maxLines: 3)
            }
            if sent > 0 {
                Text(model.t("leaving.headline.only")).sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !sub.isEmpty {
                Text(sub.joined(separator: " · ")).sfFont(15).foregroundStyle(theme.note)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("record.sub")
            }
        }
        // The display face's caps rise above its tight line box: room so the scroll view never clips them.
        .padding(.top, 6)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("record.headline")
    }
}

private struct RecordEntry: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    let entry: OutboundEntry
    /// The exact request ("For developers"): closed until asked for.
    @State private var showPayload = false
    @State private var open: Bool

    init(entry: OutboundEntry, latest: Bool) {
        self.entry = entry
        _open = State(initialValue: latest)
    }

    private var title: String {
        if let r = entry.recording { return model.t(r.onDevice ? "record.recorded.title" : "record.recordedCloud.title") }
        return entry.fields.isEmpty ? model.outboundFieldName("model-request") : entry.fields.map(model.outboundFieldName).joined(separator: ", ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            let layout = dynamicType.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
            // One line per row; what left and where open on tap. A recording is dated when it was recorded.
            Button { withMotion(Motion.reveal) { open.toggle() } } label: {
                layout {
                    if entry.recording == nil {
                        Text(model.time(entry.at)).monoFont(13, weight: 400).foregroundStyle(theme.note)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        // The whole title, on two lines when it needs them (never "Document silhouette, Mo…").
                        Text(title).sfFont(17).foregroundStyle(theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if let r = entry.recording {
                            Text(model.t("record.recordedOn", ["date": model.recordedDay(r.date)])).sfFont(13).foregroundStyle(theme.note)
                                .accessibilityIdentifier("record.recordedOn")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    status
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open, let recording = entry.recording {
                recorded(recording).revealsIntoView().transition(Motion.revealTransition)
            } else if open && !entry.isAnsweredOnDevice {
                VStack(alignment: .leading, spacing: 10) {
                    whatLeft(model.t("record.whatLeft"))
                    // Where it went (the endpoint for a model request), the model, how it was answered and when.
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.t("outbound.requestTo", ["destination": entry.destination,
                                                            "path": entry.channel == .aiCloud ? entry.model.flatMap(FirebaseServices.modelPath) ?? "" : ""]))
                            .sfFont(12).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("record.endpoint")
                        FlowLayout(spacing: 0, lineSpacing: 2) {
                            if let m = entry.model { short(model.t("outbound.model", ["model": m]), dot: true) }
                            short(model.statusText(entry), dot: true).accessibilityIdentifier("record.status")
                            short(model.longDate(entry.at), dot: false).accessibilityIdentifier("record.time")
                        }
                    }
                    if let payload = entry.payload {
                        technical {
                            MonoBlock(text: payload.text, id: "record.payload")
                        }
                    }
                }
                .revealsIntoView()
                .transition(Motion.revealTransition)
            }
        }
        .padding(16)
        .accessibilityElement(children: .contain)
    }

    /// One piece of the short line ("Model: … · Sent, response 200 · Nov 21, 2026 at 10:42 AM").
    private func short(_ text: String, dot: Bool) -> some View {
        Text(dot ? text + " · " : text).sfFont(12).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(text)
    }

    /// What left, as a person reads it: the silhouette's lines with their placeholders as chips, and what stayed
    /// here, counted. A request without a document says what kinds of things it carried.
    @ViewBuilder private func whatLeft(_ label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
            if let silhouette = entry.silhouette {
                SilhouetteLines(text: silhouette).accessibilityIdentifier("record.whatLeft")
                let kept = DocumentSession.counts(cloudText: silhouette)
                Text(model.t("record.whatStayed", ["numbers": model.number(Double(kept.numbers)), "dates": model.number(Double(kept.dates)),
                                                   "words": model.number(Double(kept.words))]))
                    .sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("record.whatStayed")
            } else {
                let fields = entry.fields.isEmpty ? ["model-request"] : entry.fields
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(fields, id: \.self) { f in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Circle().fill(theme.ink).frame(width: 5, height: 5).alignmentGuide(.firstTextBaseline) { $0[.bottom] + 4 }
                            Text(model.outboundFieldName(f)).sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("record.whatLeft")
            }
        }
    }

    /// "For developers: the request as sent", closed by default.
    private func technical<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withMotion(Motion.reveal) { showPayload.toggle() } } label: {
                HStack(spacing: 4) {
                    Text(model.t("record.technical")).sfFont(15, weight: .semibold)
                        .fixedSize(horizontal: false, vertical: true)
                    Image(systemName: showPayload ? "chevron.up" : "chevron.down").sfFont(12, weight: .semibold)
                }
                .foregroundStyle(theme.ink)
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("record.technical")
            if showPayload {
                VStack(alignment: .leading, spacing: 8) { content() }
                    .revealsIntoView()
                    .transition(Motion.revealTransition)
            }
        }
    }

    /// A recording used now: nothing sent now. A cloud recording opens on what went to the cloud when it was
    /// recorded, then the request exactly as it was sent then and the answer (placeholder ids only), folded. An
    /// on-device recording says where and when the model answered; its answer is folded.
    private func recorded(_ r: OutboundEntry.RecordedRequest) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if r.onDevice {
                NoteText(text: model.t("record.recorded.note", ["machine": r.machine ?? "", "date": model.recordedDay(r.date)]), size: 15)
                if let silhouette = entry.silhouette {
                    let kept = DocumentSession.counts(cloudText: silhouette)
                    Text(model.t("record.whatStayed", ["numbers": model.number(Double(kept.numbers)), "dates": model.number(Double(kept.dates)),
                                                       "words": model.number(Double(kept.words))]))
                        .sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("record.whatStayed")
                }
                if !r.model.isEmpty { short(model.t("outbound.model", ["model": r.model]), dot: false) }
                technical {
                    Text(model.t("record.answerReceived")).sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                    MonoBlock(text: r.answer, id: "record.recordedAnswer")
                    NoteText(text: model.t("record.answerNote"))
                }
            } else {
                whatLeft(model.t("record.whatWent"))
                NoteText(text: model.t("record.recordedCloud.note", ["date": model.recordedDay(r.date)]))
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.t("outbound.requestTo", ["destination": entry.destination, "path": r.endpoint]))
                        .sfFont(12).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("record.endpoint")
                    if !r.model.isEmpty { short(model.t("outbound.model", ["model": r.model]), dot: false) }
                }
                technical {
                    Text(model.t("record.recordedCloud.exactly", ["date": model.recordedDay(r.date)])).sfFont(15, weight: .semibold)
                        .foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    MonoBlock(text: r.body, id: "record.recordedBody")
                    Text(model.t("record.answerReceived")).sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                    MonoBlock(text: r.answer, id: "record.recordedAnswer")
                    NoteText(text: model.t("record.answerNote"))
                }
            }
        }
    }

    private var status: some View {
        Group {
            switch entry.status {
            case .attempted: StatusPill(label: model.recordStatus(entry), style: .plain)
            case .sent: StatusPill(label: model.t("record.sentShort"), style: .redact, dot: true)
            // One short word on the pill ("On iPhone"); the full status is the row's VoiceOver label.
            case .answeredOnDevice: StatusPill(label: model.t("record.keptShort"), style: .outline)
            case .recorded: StatusPill(label: model.recordStatus(entry), style: .outline)
            case .failed, .blocked: StatusPill(label: model.recordStatus(entry), style: .muted)
            }
        }
        .accessibilityLabel(model.recordStatus(entry))
    }
}

/// A silhouette's lines as they left: words that stay visible, and each number, date and hidden word as its
/// placeholder chip (N12, D3, W4), never a value. Long lines run on sideways.
struct SilhouetteLines: View {
    @Environment(\.theme) private var theme
    let text: CloudText

    var body: some View {
        let lines = DocumentCard.lines(DocumentSession.segments(cloudText: text)).filter { !$0.isEmpty }
        ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    HStack(spacing: 0) {
                        ForEach(Array(line.enumerated()), id: \.offset) { _, token in tokenView(token) }
                    }
                }
            }
            .padding(12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lines.map { line in line.map { t -> String in
            switch t {
            case .text(let s), .word(let s): s
            case .value(let id, _, _): id
            }
        }.joined() }.joined(separator: "\n"))
    }

    @ViewBuilder private func tokenView(_ token: DocumentCard.Token) -> some View {
        switch token {
        case .text(let s), .word(let s): Text(verbatim: s).monoFont(11, weight: 400).foregroundStyle(theme.ink).fixedSize()
        case .value(let id, _, _): TokenChip(id: id, size: 10, compact: true).padding(.trailing, 2)
        }
    }
}

/// An exact request: IBM Plex Mono 13 on raised, radius 12, selectable.
struct MonoBlock: View {
    @Environment(\.theme) private var theme
    let text: String
    var id: String = ""

    var body: some View {
        Text(text)
            .monoFont(13, weight: 400)
            .foregroundStyle(theme.ink)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
            .accessibilityIdentifier(id)
    }
}

extension OutboundEntry {
    var isAnsweredOnDevice: Bool { if case .answeredOnDevice = status { true } else { false } }
    var isRecorded: Bool { if case .recorded = status { true } else { false } }
}

// MARK: - Language

private struct LanguageSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        ListCard {
            ForEach(Array(AppLocale.offered.enumerated()), id: \.element) { i, locale in
                let selected = locale == model.locale
                if i > 0 { RowDivider() }
                Button {
                    model.setLocale(locale)
                    model.sheet = nil
                } label: {
                    // The check mark stays on the row's line at every text size (a trailing view stacks
                    // under the title at accessibility sizes).
                    HStack(spacing: 12) {
                        ListRow(title: locale.nativeName, chevron: false, titleWeight: selected ? .semibold : .regular, leading: { EmptyView() }) { EmptyView() }
                        if selected { Image(systemName: "checkmark").sfFont(17, weight: .semibold).foregroundStyle(theme.ink).padding(.trailing, 16) }
                    }
                    .environment(\.locale, Locale(identifier: locale.rawValue))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(locale.nativeName)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
                .accessibilityIdentifier("language.\(locale.rawValue)")
            }
        }
        NoteText(text: model.t("nav.languageNote"))
    }
}

// MARK: - Draft rules and Delete everything

private struct DemoSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        let info = model.bundle.packInfo
        Display(text: model.rulesTitle, size: 44)
        Text(info.isChecked ? model.t("pack.checked.body", ["date": model.checkedDate])
             : info.isDraft ? model.t("pack.draft.body", ["date": model.draftDate]) : model.t("demo.body"))
            .type(.lead).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
        // The body already says it is a draft and when it was read; the short notice is not repeated.
        NoteText(text: model.t("promise.line3"), size: 15)
        // The judges' path, the on-device check and where each task runs.
        ListCard {
            Button { model.open(.judges) } label: {
                ListRow(title: model.t("demo.judges"), titleWeight: .semibold) { IconTile(systemImage: "person.2") }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("demo.judges")
            RowDivider(inset: 64)
            Button { model.open(.deviceCheck) } label: {
                ListRow(title: model.t("demo.deviceCheck"), titleWeight: .semibold) { IconTile(systemImage: "iphone") }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("demo.deviceCheck")
            RowDivider(inset: 64)
            Button { model.open(.tasks) } label: {
                ListRow(title: model.t("tasks.title"), titleWeight: .semibold) { IconTile(systemImage: "arrow.triangle.branch") }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("demo.tasks")
        }
        Button { model.sheet = .delete(back: .demo) } label: {
            Label(model.t("delete.all"), systemImage: "trash")
                .sfFont(17, weight: .semibold)
                .foregroundStyle(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(theme.sheet))
        }
        .buttonStyle(PressScale())
        .accessibilityIdentifier("delete.all")
    }
}

private struct DeleteSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        Display(text: model.t("delete.title"), size: 44)
            .accessibilityIdentifier("delete.title")
        Text(model.t("delete.body")).type(.lead).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("delete.body")
    }
}
