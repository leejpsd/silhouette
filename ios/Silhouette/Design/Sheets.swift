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
    let sheet: AppSheet

    var body: some View {
        NavigationStack {
            RevealingScroll {
                VStack(alignment: .leading, spacing: 16) { content }
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
            .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        }
        .presentationDetents(sheet == .language || sheet.isDelete ? [.medium, .large] : [.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.ground)
        .accessibilityIdentifier(sheet.isSend ? "send.panel" : "sheet")
    }

    private var title: String {
        switch sheet {
        case .record: model.t("leaving.title")
        case .send: model.t("send.beforeLeaves")
        case .language: model.t("nav.language")
        case .demo: model.bundle.packInfo.isDraft ? model.t("pack.draft.title") : model.t("demo.title")
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
        if entries.isEmpty {
            HStack(spacing: 12) {
                CounterDisc(count: 0, size: 44)
                Display(text: model.t("leaving.none"), size: 34, maxLines: 3)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("record.headline")
            if let cleared = model.recordClearedAt {
                SectionLabel(text: model.t("leaving.recordDeleted", ["date": model.shortDate(cleared)]), large: false)
                NoteText(text: model.t("leaving.cleared", ["date": model.longDate(cleared)]), size: 15)
            } else {
                NoteText(text: model.t("leaving.body"), size: 15)
            }
        } else {
            headline
            NoteText(text: model.t("leaving.bodySent"), size: 15)
            if model.sentCount > 0 && !model.outboundCarriesProfile { NoteText(text: model.t("leaving.noValues"), size: 15) }
            if model.notCompletedCount > 0 {
                NoteText(text: model.t("leaving.notCompleted", ["count": model.number(Double(model.notCompletedCount))]), size: 15)
                    .accessibilityIdentifier("leaving.notCompleted")
            }
            if let cleared = model.recordClearedAt { NoteText(text: model.t("leaving.cleared", ["date": model.longDate(cleared)])) }
            ListCard {
                ForEach(Array(entries.enumerated()), id: \.element.id) { i, entry in
                    if i > 0 { RowDivider(inset: 0) }
                    RecordEntry(entry: entry)
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

    /// "2 SENT, 1 KEPT.": the sent part ink on a redact block (orange is never text on a light surface).
    private var headline: some View {
        let sent = model.t("leaving.sentCount", ["count": model.number(Double(model.sentCount))])
        let kept = model.t("leaving.keptCount", ["count": model.number(Double(model.keptCount))])
        return FlowLayout(spacing: 10, lineSpacing: 4) {
            Display(text: sent, size: 54, maxLines: 2, color: theme.onRedact)
                .fixedSize()
                .padding(.horizontal, 6)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 4).fill(theme.redact))
            Display(text: kept, size: 54, maxLines: 2)
                .fixedSize()
                .padding(.vertical, 6)
        }
        // The display face's caps rise above its tight line box: room so the scroll view never clips them.
        .padding(.top, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(sent) \(kept)")
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("record.headline")
    }
}

private struct RecordEntry: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    let entry: OutboundEntry
    @State private var showPayload = false
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            let layout = dynamicType.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
            // One line per row; where it went and the exact request open on tap.
            Button { withMotion(Motion.reveal) { open.toggle() } } label: {
                layout {
                    Text(model.time(entry.at)).monoFont(13, weight: 400).foregroundStyle(theme.note)
                    Text(entry.fields.isEmpty ? model.outboundFieldName("model-request") : entry.fields.map(model.outboundFieldName).joined(separator: ", "))
                        .sfFont(17).foregroundStyle(theme.ink)
                        .lineLimit(dynamicType.isAccessibilitySize ? nil : 1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    status
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open && !entry.isAnsweredOnDevice {
              VStack(alignment: .leading, spacing: 10) {
                NoteText(text: model.t("outbound.requestTo", ["destination": entry.destination, "path": ""]))
                if let m = entry.model { NoteText(text: model.t("outbound.model", ["model": m])) }
                if let payload = entry.payload {
                    Button { withMotion(Motion.reveal) { showPayload.toggle() } } label: {
                        HStack(spacing: 4) {
                            Text(model.t("outbound.showPayload")).sfFont(15, weight: .semibold)
                            Image(systemName: showPayload ? "chevron.up" : "chevron.down").sfFont(12, weight: .semibold)
                        }
                        .foregroundStyle(theme.ink)
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    if showPayload { MonoBlock(text: payload.text).revealsIntoView().transition(Motion.revealTransition) }
                }
              }
              .revealsIntoView()
              .transition(Motion.revealTransition)
            }
        }
        .padding(16)
        .accessibilityElement(children: .contain)
    }

    private var status: some View {
        Group {
            switch entry.status {
            case .attempted: StatusPill(label: model.recordStatus(entry), style: .plain)
            case .sent: StatusPill(label: model.t("record.sentShort"), style: .redact, dot: true)
            case .answeredOnDevice: StatusPill(label: model.recordStatus(entry), style: .outline)
            case .failed, .blocked: StatusPill(label: model.recordStatus(entry), style: .muted)
            }
        }
        .accessibilityLabel(model.recordStatus(entry))
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
}

// MARK: - Language

private struct LanguageSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        ListCard {
            ForEach(Array(AppLocale.allCases.enumerated()), id: \.element) { i, locale in
                let selected = locale == model.locale
                if i > 0 { RowDivider() }
                Button {
                    model.setLocale(locale)
                    model.sheet = nil
                } label: {
                    ListRow(title: locale.nativeName, chevron: false, titleWeight: selected ? .semibold : .regular, leading: { EmptyView() }) {
                        if selected { Image(systemName: "checkmark").sfFont(17, weight: .semibold).foregroundStyle(theme.ink) }
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
        let draft = model.bundle.packInfo.isDraft
        Display(text: model.t(draft ? "pack.draft.title" : "demo.title"), size: 44)
        Text(draft ? model.t("pack.draft.body", ["date": model.draftDate]) : model.t("demo.body"))
            .type(.lead).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
        if draft { NoteText(text: model.t("pack.draft.notice", ["date": model.draftDate]), size: 15) }
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
    }
}
