// Sheets: the block grown over the lower screen, with a dimmed 108 pt glimpse of the screen above,
// a 14/700 title and a 44 pt close button. Rises 40 pt in 600 ms (none under Reduce Motion).
// Used for the record of what left this device, the step before sending, the language, the demo
// rules and "Delete everything".

import SilhouetteCore
import SilhouetteKit
import SwiftUI

enum AppSheet: Equatable {
    case record
    case language
    case demo
    /// The confirmation; `back` is the sheet it was opened from.
    case delete(back: Back)
    /// The step before sending, for the request with this key.
    case send(String)

    enum Back: Equatable { case record, demo }
}

struct SheetHost: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || MotionSwitch.off }

    var body: some View {
        ZStack(alignment: .bottom) {
            if let sheet = model.sheet {
                Color.clear
                    .contentShape(Rectangle())
                    .background(theme.ground.opacity(0.6))
                    .ignoresSafeArea()
                    .onTapGesture { close(sheet) }
                    .accessibilityHidden(true)
                    .transition(.opacity)
                SheetPanel(sheet: sheet, onClose: { close(sheet) })
                    .padding(.top, theme.size("recordGlimpse"))
                    .transition(reduceMotion ? .opacity : .offset(y: 40).combined(with: .opacity))
                    .id(sheetIdentity(sheet))
            }
        }
        .animation(reduceMotion ? nil : theme.curve("standard", duration: "sheetUp"), value: model.sheet)
        // A closing sheet fades out without catching taps meant for the screen.
        .allowsHitTesting(model.sheet != nil)
    }

    private func sheetIdentity(_ sheet: AppSheet) -> String {
        switch sheet {
        case .record: "record"
        case .language: "language"
        case .demo: "demo"
        case .delete: "delete"
        case .send(let key): "send-\(key)"
        }
    }

    private func close(_ sheet: AppSheet) {
        switch sheet {
        case .send(let key):
            // Closing the step before sending sends nothing.
            model.keepOnDevice(key)
        case .delete(let back):
            model.sheet = back == .record ? .record : .demo
            return
        default: break
        }
        model.sheet = nil
    }
}

private struct SheetPanel: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let sheet: AppSheet
    let onClose: () -> Void
    @AccessibilityFocusState private var titleFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .type(.control)
                    .foregroundStyle(theme.onBlock)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($titleFocused)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(theme.onBlock)
                        .frame(width: theme.minTapTarget, height: theme.minTapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel(sheet == .record ? model.t("leaving.hide") : model.t("nav.close"))
                .accessibilityIdentifier(sheet == .record ? "leaving.hide" : "sheet.close")
            }
            .padding(.leading, theme.gutter)
            .padding(.trailing, 8)
            .padding(.top, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space("md")) { content }
                    .padding(.horizontal, theme.gutter)
                    .padding(.top, 8)
                    .padding(.bottom, theme.space("xl"))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)
            footer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(UnevenRoundedRectangle(topLeadingRadius: theme.radius("block"), topTrailingRadius: theme.radius("block"))
            .fill(theme.block)
            .ignoresSafeArea(edges: .bottom))
        .environment(\.surface, .block)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, onClose)
        .accessibilityIdentifier(sheet.isSend ? "send.panel" : "sheet")
        .onAppear { titleFocused = true }
    }

    private var title: String {
        switch sheet {
        case .record, .send: model.t("leaving.title")
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
        case .demo:
            SheetFooter {
                BlockAction(label: model.t("nav.close"), id: "demo.close") { model.sheet = nil }
            }
        case .delete:
            SheetFooter {
                Button { model.deleteEverything() } label: {
                    Label(model.t("delete.confirm"), systemImage: "trash")
                }
                .buttonStyle(OutlineStyle(fullWidth: true))
                .accessibilityIdentifier("delete.confirm")
                BlockAction(label: model.t("delete.cancel"), id: "delete.cancel", arrow: false, centered: true) { onClose() }
            }
        case .send(let key):
            if case .confirm(let request, _) = model.state(key) {
                SendFooter(key: key, request: request)
            }
        default:
            EmptyView()
        }
    }
}

extension AppSheet {
    var isSend: Bool { if case .send = self { true } else { false } }
}

struct SheetFooter<Content: View>: View {
    @Environment(\.theme) private var theme
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 10) { content }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 8)
    }
}

// MARK: - Record of what left this device

private struct RecordSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let entries = model.outbound
        if entries.isEmpty {
            TightText(text: model.number(0), role: .giantNumber, color: theme.onBlock)
                .padding(.top, 24)
                .padding(.bottom, 8)
                .accessibilityHidden(true)
            if let cleared = model.recordClearedAt {
                SectionHeading(text: model.t("leaving.recordDeleted", ["date": model.shortDate(cleared)]))
                Para(model.t("leaving.cleared", ["date": model.longDate(cleared)]))
            } else {
                Para(model.t("leaving.body"))
            }
        } else {
            headline
            Para(model.t("leaving.bodySent"))
            if model.sentCount > 0 && !model.outboundCarriesProfile { Para(model.t("leaving.noValues")) }
            if let cleared = model.recordClearedAt { Para(model.t("leaving.cleared", ["date": model.longDate(cleared)]), .small, muted: true) }
        }
        Para(model.t("leaving.sdkNote"), .small, muted: true)
        Para(model.t("leaving.network"), .small, muted: true)
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(entries) { entry in
                    RecordEntry(entry: entry)
                    Rectangle().fill(theme.blockLine).frame(height: 1)
                }
            }
            .overlay(alignment: .top) { Rectangle().fill(theme.blockLine).frame(height: 1) }
        }
        Button { model.sheet = .delete(back: .record) } label: {
            Label(model.t("delete.all"), systemImage: "trash")
        }
        .buttonStyle(OutlineStyle(fullWidth: true))
        .accessibilityIdentifier("delete.all")
        .padding(.top, 8)
    }

    /// "4 sent, 1 kept.": the sent part on a pink highlight, size-stepped.
    private var headline: some View {
        let sent = model.t("leaving.sentCount", ["count": model.number(Double(model.sentCount))])
        let kept = model.t("leaving.keptCount", ["count": model.number(Double(model.keptCount))])
        return FlowLayout(spacing: 12, lineSpacing: 6) {
            DisplayLabel(text: sent, role: .recordHeadline, maxLines: 2, color: theme.onLeave)
                .fixedSize()
                .padding(.horizontal, 8)
                .padding(.bottom, 4)
                .background {
                    RoundedRectangle(cornerRadius: theme.radius("bar")).fill(theme.leave)
                    if scheme == .dark { RoundedRectangle(cornerRadius: theme.radius("bar")).strokeBorder(theme.leaveFocus, lineWidth: theme.border) }
                }
                .rotationEffect(theme.rotation("highlight"))
            DisplayLabel(text: kept, role: .recordHeadline, maxLines: 2, color: theme.onBlock)
                .fixedSize()
                .padding(.bottom, 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(sent) \(kept)")
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("record.headline")
    }
}

private struct RecordEntry: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let entry: OutboundEntry
    @State private var showPayload = false

    @Environment(\.dynamicTypeSize) private var dynamicType

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(model.time(entry.at))
                .type(.monoValue)
                .foregroundStyle(theme.onBlock)
                .frame(minWidth: theme.size("recordTimeColumn"), alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.fields.isEmpty ? model.outboundFieldName("model-request") : entry.fields.map(model.outboundFieldName).joined(separator: ", "))
                    .type(.bodyStrong)
                    .foregroundStyle(theme.onBlock)
                    .fixedSize(horizontal: false, vertical: true)
                if dynamicType.isAccessibilitySize { status }
                if !entry.isAnsweredOnDevice {
                    Para(model.t("outbound.requestTo", ["destination": entry.destination, "path": ""]), .small)
                    if let m = entry.model { Para(model.t("outbound.model", ["model": m]), .small) }
                    if let payload = entry.payload {
                        Disclosure(label: model.t("outbound.showPayload"), open: $showPayload) {
                            Text(payload.text)
                                .type(.monoValue)
                                .textSelection(.enabled)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .paper(tilt: .degrees(theme.tokens.number("rotation.paperSmall") ?? -1), size: .small)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !dynamicType.isAccessibilitySize {
                status.frame(maxWidth: 128, alignment: .trailing)
            }
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .contain)
    }

    private var status: some View {
        HStack(spacing: 6) {
            switch entry.status {
            case .attempted: Marker(kind: .loading)
            case .sent: Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy))
            case .answeredOnDevice: Image(systemName: "iphone").font(.system(size: 13, weight: .semibold))
            case .failed: Image(systemName: "xmark.circle").font(.system(size: 14, weight: .semibold))
            }
            Text(model.recordStatus(entry)).type(.label, size: 12).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(theme.onBlock)
        .accessibilityElement(children: .combine)
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
        VStack(spacing: 10) {
            ForEach(AppLocale.allCases) { locale in
                let selected = locale == model.locale
                Button {
                    model.setLocale(locale)
                    model.sheet = nil
                } label: {
                    HStack {
                        Text(locale.nativeName)
                            .type(.optionWord)
                            .environment(\.locale, Locale(identifier: locale.rawValue))
                            .foregroundStyle(selected ? theme.ink : theme.onBlock)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        RadioMark(selected: selected, ink: selected ? theme.ink : theme.onBlock)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: theme.size("optionRowHeight"))
                    .background(RoundedRectangle(cornerRadius: theme.radius("option")).fill(selected ? theme.ground : .clear))
                    .overlay(RoundedRectangle(cornerRadius: theme.radius("option")).strokeBorder(theme.onBlock, lineWidth: theme.border))
                    .contentShape(RoundedRectangle(cornerRadius: theme.radius("option")))
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel(locale.nativeName)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
                .accessibilityIdentifier("language.\(locale.rawValue)")
            }
        }
        Para(model.t("nav.languageNote"), .small)
    }
}

// MARK: - Demo rules and Delete everything

private struct DemoSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        let draft = model.bundle.packInfo.isDraft
        DisplayHeadline(text: model.t(draft ? "pack.draft.title" : "demo.title"), role: .title, size: 44, maxLines: 4, color: theme.onBlock)
        Para(draft ? model.t("pack.draft.body", ["date": model.draftDate]) : model.t("demo.body"))
        if draft { Para(model.t("pack.draft.notice", ["date": model.draftDate]), .small) }
        Para(model.t("promise.line3"), .small)
        // A short path for judges, and the on-device check: reachable from here, not from the main flow.
        VStack(alignment: .leading, spacing: 0) {
            Button {
                model.sheet = nil
                model.path = [.judges]
            } label: { Label(model.t("demo.judges"), systemImage: "arrow.right") }
                .buttonStyle(TextLinkStyle())
                .accessibilityIdentifier("demo.judges")
            Button {
                model.sheet = nil
                model.path = [.deviceCheck]
            } label: { Label(model.t("demo.deviceCheck"), systemImage: "arrow.right") }
                .buttonStyle(TextLinkStyle())
                .accessibilityIdentifier("demo.deviceCheck")
        }
        .padding(.top, 4)
        Button { model.sheet = .delete(back: .demo) } label: {
            Label(model.t("delete.all"), systemImage: "trash")
        }
        .buttonStyle(OutlineStyle(fullWidth: true))
        .accessibilityIdentifier("delete.all")
        .padding(.top, 8)
    }
}

private struct DeleteSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        DisplayHeadline(text: model.t("delete.title"), role: .title, size: 44, maxLines: 4, color: theme.onBlock)
            .accessibilityIdentifier("delete.title")
        Para(model.t("delete.body"))
    }
}
