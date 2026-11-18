// The silhouette before anything could leave: the hero "What could leave", the segmented
// control (on this iPhone / what could leave), the document card in IBM Plex Mono with token chips
// (each line on one line: it fits or scrolls sideways, never breaks), and the decision: send the
// silhouette (redact) or keep it on this iPhone. Words still visible can be hidden (every occurrence,
// whole phrase) and shown again.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct DocumentPreviewScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.pinsActions) private var pinsActions
    @State private var leave = true
    @State private var reading = false

    private func read(keep: Bool) {
        guard !reading else { return }
        reading = true
        Task { await model.readDocument(keepOnDevice: keep); reading = false }
    }

    var body: some View {
        RevealingScroll {
            VStack(alignment: .leading, spacing: 16) {
                Hero(eyebrow: model.t("preview.onPhoneLead"), title: model.t("preview.couldLeave"), size: 58, titleId: "preview.title") {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            GlassRound(systemImage: "chevron.left", label: model.t("q.back"), id: "preview.back") { model.back() }
                            Spacer(minLength: 0)
                            GlassCapsule(label: model.t("preview.another"), systemImage: "arrow.counterclockwise", id: "preview.another") {
                                model.anotherDocument()
                            }
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    DraftLine()
                    if let silhouette = model.silhouette {
                        Segmented(options: [(false, model.t("preview.onPhone"), "preview.mode.phone"), (true, model.t("preview.couldLeave"), "preview.mode.leave")],
                                  selection: $leave, dotFor: true)
                            .accessibilityElement(children: .contain)
                            .accessibilityIdentifier("preview.mode")
                        let counts = DocumentSession.counts(silhouette)
                        DocumentCard(segments: DocumentSession.segments(of: silhouette), leave: leave,
                                     hidden: Set(model.document.hiddenWordsForDisplay.map { $0.lowercased() })) { word in
                            model.hideWord(word)
                        }
                        NoteText(text: model.t("preview.counts", ["numbers": String(counts.numbers), "dates": String(counts.dates), "words": String(counts.words)]))
                            .accessibilityIdentifier("preview.counts")
                        if leave { NoteText(text: model.t("preview.leadShort")) }
                        hiddenWords
                    } else {
                        NoteText(text: model.t("preview.missing"), size: 15)
                    }
                    if model.silhouette != nil { decisionInfo.padding(.top, 4) }
                    if model.silhouette != nil && !pinsActions {
                        VStack(spacing: 2) { decisionActions }
                    }
                }
                .gutter()
            }
            .padding(.bottom, 24)
        }
        .heroScreen(theme)
        // The decision stays in the first screen, above the pill (in the content at accessibility
        // sizes, where pinned buttons would take the screen).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.silhouette != nil && pinsActions {
                VStack(spacing: 2) { decisionActions }
                    .gutter()
                    .padding(.top, 8)
                    .background(theme.ground)
            }
        }
    }

    /// A hidden word as the document writes it (they are kept lower-cased for matching).
    private func asWritten(_ lower: String) -> String {
        guard let silhouette = model.silhouette else { return lower }
        for segment in DocumentSession.segments(of: silhouette) {
            if case .placeholder(_, _, let original?) = segment, original.lowercased() == lower { return original }
        }
        return lower
    }

    @ViewBuilder private var hiddenWords: some View {
        let hidden = model.document.hiddenWordsForDisplay
        if !hidden.isEmpty {
            Card {
                Text(model.t("preview.hidden")).sfFont(15, weight: .semibold).foregroundStyle(theme.ink).accessibilityAddTraits(.isHeader)
                ForEach(hidden, id: \.self) { word in
                    HStack {
                        Text(model.t("preview.youHid", ["word": "“\(asWritten(word))”"])).sfFont(15).foregroundStyle(theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        LinkText(label: model.t("preview.unhide", ["word": word]), size: 13, id: "preview.unhide.\(word)") { model.unhideWord(word) }
                    }
                    .padding(.top, 6)
                }
                SecondaryButton(label: model.t("preview.undo"), filled: false, id: "preview.undo") {
                    if let last = hidden.last { model.unhideWord(last) }
                }
            }
        }
    }

    // MARK: The decision

    private var extractorKind: Int {
        let extractor = model.documentExtractor
        return extractor is ModelPointerExtractor ? 0 : extractor != nil ? 1 : 2
    }

    private var unreliable: Bool { model.documentError?.kind == .onDeviceUnreliable }

    /// Where it would be read and why, and any notice: in the content.
    @ViewBuilder private var decisionInfo: some View {
        switch extractorKind {
        case 0:
            // A model reads the silhouette: on this device first, or in the cloud when this device has
            // no model. What could leave is exactly the silhouette shown above.
            ProvenanceBadge(source: model.deviceModelAvailable ? .onDevice : .inCloud, reason: .documentSilhouetteOnly,
                            noDeviceModel: !model.deviceModelAvailable)
            if unreliable {
                // Kept on the device by the person's choice, and the device could not read it reliably:
                // nothing was filled in and nothing was sent.
                NoticeCard(text: model.t("error.on-device-unreliable"))
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("preview.unreliable")
                    // The result of "Keep everything": brought into view above the actions, and read out.
                    .revealsIntoView()
                    .onAppear { AccessibilityNotification.Announcement(model.t("error.on-device-unreliable")).post() }
            } else {
                NoteText(text: model.t(model.deviceModelAvailable ? "preview.onDevice" : "preview.cloud"))
                    .accessibilityIdentifier("preview.modelLead")
                if let error = model.documentError {
                    NoticeCard(text: model.t(error.copyKey)).accessibilityIdentifier("preview.error")
                        .revealsIntoView()
                        .onAppear { AccessibilityNotification.Announcement(model.t(error.copyKey)).post() }
                }
            }
        case 1:
            ProvenanceBadge(source: .sampleAnswerKey, reason: .sampleAnswerKey)
            NoteText(text: model.t("preview.sample"))
        default:
            NoteText(text: model.t("preview.noExtractor"))
                .accessibilityIdentifier("preview.noExtractor")
        }
    }

    /// The actions, pinned above the pill: send the silhouette (redact) or keep it on this iPhone.
    @ViewBuilder private var decisionActions: some View {
        switch extractorKind {
        case 0:
            if reading {
                // Which step the device is on (DEVICE_READING.md section 7).
                SpinnerLine(text: model.t(model.readingStage?.copyKey ?? "preview.sending"))
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .accessibilityIdentifier("preview.stage")
            } else if unreliable {
                PrimaryButton(label: model.t("preview.sendSilhouette"), sends: true, id: "preview.sendSilhouette") { read(keep: false) }
                SecondaryButton(label: model.t("error.typeInstead"), filled: false, id: "preview.typeInstead") { model.typeNumbers() }
            } else {
                PrimaryButton(label: model.t("preview.sendSilhouette"), sends: true, id: "preview.send") { read(keep: false) }
                // Keep everything on this device: the device reads it when it has a model; otherwise type the numbers.
                SecondaryButton(label: model.t("send.skip"), filled: false, id: "preview.keep") {
                    if model.deviceModelAvailable { read(keep: true) } else { model.typeNumbers() }
                }
            }
        case 1:
            PrimaryButton(label: model.t("preview.sampleButton"), id: "preview.sampleButton", busy: reading) {
                reading = true
                Task { await model.readDocument(); reading = false }
            }
            .disabled(reading)
        default:
            PrimaryButton(label: model.t("doc.manual"), id: "preview.manual") { model.typeNumbers() }
        }
    }
}

/// The document in IBM Plex Mono 13 on a white card. On this iPhone: every value as written. What
/// could leave: each value is a token chip with its id (outlined for a word you hid), and each word
/// still visible is a link that hides it. Lines never break: the card scrolls sideways when needed.
struct DocumentCard: View {
    @Environment(\.theme) private var theme
    @Environment(AppModel.self) private var model
    let segments: [PreviewSegment]
    let leave: Bool
    let hidden: Set<String>
    let hide: (String) -> Void
    @State private var width: CGFloat = 340
    /// Where the sideways scroll is: more to the left, more to the right.
    @State private var moreLeft = false
    @State private var moreRight = true

    /// IBM Plex Mono's advance is 0.6 em; a token chip adds about two characters of padding.
    static let advance: CGFloat = 0.6

    /// The longest line in characters, as drawn in this mode.
    private func columns(_ lines: [[Token]]) -> CGFloat {
        lines.map { line in
            line.reduce(CGFloat(0)) { sum, token in
                switch token {
                case .text(let s): sum + CGFloat(s.count)
                case .word(let w): sum + CGFloat(w.count)
                case .value(let id, let original, _): sum + (leave ? CGFloat(id.count) + 2.4 : CGFloat(original.count))
                }
            }
        }.max() ?? 1
    }

    var body: some View {
        let lines = Self.lines(segments)
        // The mono size that fits the longest line, from 13 down to 9; below that the card scrolls.
        let fitting = width / max(columns(lines) * Self.advance, 1)
        let size = min(13, max(9, floor(fitting * 2) / 2))
        let scrolls = fitting < 9
        ZStack {
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        HStack(spacing: 0) {
                            ForEach(Array(line.enumerated()), id: \.offset) { _, token in tokenView(token, size: size) }
                        }
                        .frame(minHeight: size + 8, alignment: .leading)
                    }
                }
                // Scrolling, the lines run to the card's own edge (under the cue), not to a cut
                // inside its padding.
                .padding(.horizontal, scrolls ? 16 : 0)
            }
            .padding(.horizontal, scrolls ? -16 : 0)
            .scrollDisabled(!scrolls)
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .onScrollGeometryChange(for: [Bool].self) { g in
                [g.contentOffset.x > 2, g.contentOffset.x + g.containerSize.width < g.contentSize.width - 2]
            } action: { _, v in
                withMotion(Motion.short) { moreLeft = v[0]; moreRight = v[1] }
            }
            if scrolls {
                // The cue that the lines go on, on the side where there is more: a soft edge and a
                // chevron in a disc; none at an end of the line.
                HStack(spacing: 0) {
                    cue(leading: true).opacity(moreLeft ? 1 : 0)
                    Spacer(minLength: 0)
                    cue(leading: false).opacity(moreRight ? 1 : 0)
                }
                .padding(.horizontal, -16)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(theme.cardBorder, lineWidth: 1))
        // The two layouts swap at once (a cross-fade doubled the words); the chips then wipe in.
        .transaction(value: leave) { $0.animation = nil }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(leave ? "preview.skeleton" : "preview.original")
    }

    private func cue(leading: Bool) -> some View {
        LinearGradient(stops: [.init(color: theme.sheet, location: 0), .init(color: theme.sheet, location: 0.55), .init(color: theme.sheet.opacity(0), location: 1)],
                       startPoint: leading ? .leading : .trailing, endPoint: leading ? .trailing : .leading)
            .frame(width: 44)
            .overlay(alignment: leading ? .leading : .trailing) {
                Image(systemName: leading ? "chevron.left" : "chevron.right")
                    .sfFont(12, weight: .bold).foregroundStyle(theme.ink)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(theme.raised))
                    .padding(.horizontal, 6)
            }
    }

    enum Token {
        case text(String)
        case word(String)
        case value(id: String, original: String, order: Int)
    }

    /// The pieces a line can wrap between: runs of spaces, and runs of everything else (a value with
    /// the punctuation next to it stays together).
    static func units(_ line: [Token]) -> [[Token]] {
        var out: [[Token]] = []
        var current: [Token] = []
        for token in line {
            if case .text(let s) = token, s.allSatisfy({ $0 == " " }) {
                if !current.isEmpty { out.append(current); current = [] }
                out.append([token])
            } else {
                current.append(token)
            }
        }
        if !current.isEmpty { out.append(current) }
        return out
    }

    static func isSpace(_ unit: [Token]) -> Bool {
        if unit.count == 1, case .text(let s) = unit[0] { return s.allSatisfy { $0 == " " } }
        return false
    }

    /// Lines of tokens; text is split into runs of spaces and runs of other characters.
    static func lines(_ segments: [PreviewSegment]) -> [[Token]] {
        var lines: [[Token]] = [[]]
        var order = 0
        func addText(_ s: String) {
            let parts = s.components(separatedBy: "\n")
            for (i, part) in parts.enumerated() {
                if i > 0 { lines.append([]) }
                var chunk = ""
                for ch in part {
                    if let last = chunk.last, (last == " ") != (ch == " ") { lines[lines.count - 1].append(.text(chunk)); chunk = "" }
                    chunk.append(ch)
                }
                if !chunk.isEmpty { lines[lines.count - 1].append(.text(chunk)) }
            }
        }
        for seg in segments {
            switch seg {
            case .text(let s): addText(s)
            case .word(let w): lines[lines.count - 1].append(.word(w))
            case .placeholder(let id, _, let original):
                lines[lines.count - 1].append(.value(id: id, original: original ?? id, order: order))
                order += 1
            }
        }
        return lines
    }

    @ViewBuilder private func tokenView(_ token: Token, size: CGFloat) -> some View {
        let mono = Font(DesignFonts.uiFont(.mono, weight: 400, size: size))
        switch token {
        case .text(let s):
            Text(verbatim: s).font(mono).foregroundStyle(theme.ink).fixedSize().accessibilityHidden(s.trimmingCharacters(in: .whitespaces).isEmpty)
        case .word(let w):
            if leave {
                Button { hide(w) } label: {
                    Text(verbatim: w).font(mono).foregroundStyle(theme.ink).underline(true, color: theme.underline).fixedSize()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(w)
                .accessibilityHint(model.t("preview.hideWord", ["word": w]))
                .accessibilityRemoveTraits(.isButton)
                .accessibilityAddTraits(.isLink)
            } else {
                Text(verbatim: w).font(mono).foregroundStyle(theme.ink).fixedSize()
            }
        case .value(let id, let original, let order):
            let mine = hidden.contains(original.lowercased())
            Group {
                if leave {
                    if mine {
                        Text(verbatim: id).font(Font(DesignFonts.uiFont(.mono, weight: 600, size: size * 0.92))).foregroundStyle(theme.ink)
                            .padding(.horizontal, 4).padding(.vertical, 1)
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(theme.ink, lineWidth: 1.25))
                            .fixedSize()
                    } else {
                        TokenChip(id: id, size: size * 0.92, compact: true)
                            .modifier(ChipWipe(order: order))
                    }
                } else {
                    Text(verbatim: original).font(Font(DesignFonts.uiFont(.mono, weight: 500, size: size))).foregroundStyle(theme.ink).fixedSize()
                }
            }
            .padding(.trailing, 2)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(leave ? model.t(Self.labelKey(id)) + " \(id)" : original)
        }
    }

    static func labelKey(_ id: String) -> String {
        switch id.first {
        case "N": "placeholder.number"
        case "D": "placeholder.date"
        default: "placeholder.word"
        }
    }
}

/// A chip that arrives with "What could leave": its fill wipes in from the left, one chip after
/// another (`delay.stagger`, capped at 8); at once under Reduce Motion and in snapshots.
private struct ChipWipe: ViewModifier {
    let order: Int
    @State private var shown = MotionSwitch.off || Motion.reduceMotion

    func body(content: Content) -> some View {
        content
            .mask(alignment: .leading) {
                Rectangle().scaleEffect(x: shown ? 1 : 0.001, anchor: .leading)
            }
            .onAppear {
                guard !shown else { return }
                withAnimation(Motion.reveal.delay(Double(min(order, Motion.staggerCap)) * Motion.stagger)) { shown = true }
            }
    }
}
