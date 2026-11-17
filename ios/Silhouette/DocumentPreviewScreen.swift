// The silhouette before anything could leave: the document on paper, switching between how it reads on
// this phone and what could leave (each value cross-fades to its bar). Words still visible can be
// hidden (every occurrence, whole phrase) and shown again. The block holds the decision.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct DocumentPreviewScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var leave = true
    @State private var reading = false

    private func read(keep: Bool) {
        reading = true
        Task { await model.readDocument(keepOnDevice: keep); reading = false }
    }

    var body: some View {
        Screen(mode: .decision) {
            BackLink(label: model.t("q.back")) { if !model.path.isEmpty { model.path.removeLast() } }
                .padding(.bottom, -8)
            DisplayHeadline(text: model.t("preview.title"), role: .title, maxLines: 4)
                .accessibilityIdentifier("preview.title")
                .appear(.rise)
            if let silhouette = model.silhouette {
                Para(model.t("preview.lead"), .small)
                let counts = DocumentSession.counts(silhouette)
                Text(model.t("preview.counts", ["numbers": String(counts.numbers), "dates": String(counts.dates), "words": String(counts.words)]))
                    .type(.label)
                    .foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("preview.counts")
                LeaveToggle(phoneLabel: model.t("preview.onPhone"), leaveLabel: model.t("preview.couldLeave"), leave: $leave)
                    .accessibilityIdentifier("preview.mode")
                DocumentPaper(segments: DocumentSession.segments(of: silhouette), leave: leave,
                              hidden: Set(model.document.hiddenWordsForDisplay.map { $0.lowercased() })) { word in
                    model.hideWord(word)
                }
                .padding(.vertical, 8)
                if leave {
                    Para(model.t("preview.hideHelp"), .small)
                }
                hiddenWords
            } else {
                Para(model.t("preview.missing"))
            }
        } actions: {
            if model.silhouette != nil { decision }
        }
    }

    @ViewBuilder private var hiddenWords: some View {
        let hidden = model.document.hiddenWordsForDisplay
        if !hidden.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(model.t("preview.hidden")).type(.label).foregroundStyle(theme.ink).accessibilityAddTraits(.isHeader)
                ForEach(hidden, id: \.self) { word in
                    VStack(alignment: .leading, spacing: 0) {
                        Para(model.t("preview.youHid", ["word": "“\(word)”"]), .small)
                        Button(model.t("preview.unhide", ["word": word])) { model.unhideWord(word) }
                            .buttonStyle(TextLinkStyle(role: .control))
                            .accessibilityIdentifier("preview.unhide.\(word)")
                    }
                }
                Button(model.t("preview.undo")) { if let last = hidden.last { model.unhideWord(last) } }
                    .buttonStyle(OutlineStyle())
                    .accessibilityIdentifier("preview.undo")
            }
        }
    }

    // MARK: The decision in the block

    @ViewBuilder private var decision: some View {
        let extractor = model.documentExtractor
        if extractor is ModelPointerExtractor {
            // A model reads the silhouette: on this device first, or in the cloud when this device
            // has no model. What could leave is exactly the silhouette shown above.
            ProvenanceBadge(source: model.deviceModelAvailable ? .onDevice : .inCloud, reason: .documentSilhouetteOnly,
                            noDeviceModel: !model.deviceModelAvailable)
                .padding(.horizontal, 6)
            if model.documentError?.kind == .onDeviceUnreliable {
                // Kept on the device by the person's choice, and the device could not read it reliably:
                // nothing was filled in and nothing was sent.
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle").accessibilityHidden(true)
                    Text(model.t("error.on-device-unreliable")).fixedSize(horizontal: false, vertical: true)
                }
                .type(.label, size: 13.5)
                .foregroundStyle(theme.onBlock)
                .padding(.horizontal, 6)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("preview.unreliable")
                if reading {
                    LoadingLines(text: model.t(model.readingStage?.copyKey ?? "preview.sending")).padding(.horizontal, 6).padding(.vertical, 8)
                } else {
                    BlockAction(label: model.t("preview.sendSilhouette"), id: "preview.sendSilhouette") { read(keep: false) }
                    Button(model.t("error.typeInstead")) { model.typeNumbers() }
                        .buttonStyle(TextLinkStyle())
                        .frame(maxWidth: .infinity)
                        .accessibilityIdentifier("preview.typeInstead")
                }
            } else {
                Para(model.t(model.deviceModelAvailable ? "preview.onDevice" : "preview.cloud"), .small)
                    .padding(.horizontal, 6)
                    .accessibilityIdentifier("preview.modelLead")
                if let error = model.documentError {
                    Label(model.t(error.copyKey), systemImage: "exclamationmark.triangle")
                        .type(.label, size: 13.5).foregroundStyle(theme.onBlock).fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 6)
                        .accessibilityIdentifier("preview.error")
                }
                if reading {
                    // Which step the device is on (DEVICE_READING.md section 7).
                    LoadingLines(text: model.t(model.readingStage?.copyKey ?? "preview.sending")).padding(.horizontal, 6).padding(.vertical, 8)
                        .accessibilityIdentifier("preview.stage")
                } else {
                    HStack(spacing: 10) {
                        // Keep everything on this device: the device reads it when it has a model; otherwise type the numbers.
                        Button(model.t("send.skip")) {
                            if model.deviceModelAvailable { read(keep: true) } else { model.typeNumbers() }
                        }
                        .buttonStyle(OutlineStyle(large: true, fullWidth: true))
                        .accessibilityIdentifier("preview.keep")
                        SendButton(label: model.t("send.send"), id: "preview.send") { read(keep: false) }
                    }
                }
            }
        } else if extractor != nil {
            ProvenanceBadge(source: .sampleAnswerKey, reason: .sampleAnswerKey).padding(.horizontal, 6)
            Para(model.t("preview.sample"), .small).padding(.horizontal, 6)
            BlockAction(label: model.t("preview.sampleButton"), id: "preview.sampleButton") {
                reading = true
                Task { await model.readDocument(); reading = false }
            }
            .disabled(reading)
        } else {
            Para(model.t("preview.noExtractor"), .small)
                .padding(.horizontal, 6)
                .accessibilityIdentifier("preview.noExtractor")
            BlockAction(label: model.t("doc.manual"), id: "preview.manual") { model.typeNumbers() }
        }
    }
}

// MARK: - The document on paper

/// The document in DM Mono 14 / 22 on a large paper slip. On this phone: every value as written,
/// underlined. What could leave: each value is a bar with its id (pink; green for a word you hid), and
/// each word still visible is a link that hides it.
struct DocumentPaper: View {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(AppModel.self) private var model
    let segments: [PreviewSegment]
    let leave: Bool
    let hidden: Set<String>
    let hide: (String) -> Void

    var body: some View {
        let lines = Self.lines(segments)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                // A document line wraps between words only; the rest of a wrapped line is indented,
                // so it reads as the same line.
                DocumentLineLayout(indent: 16, lineSpacing: 2) {
                    ForEach(Array(Self.units(line).enumerated()), id: \.offset) { _, unit in
                        HStack(spacing: 0) {
                            ForEach(Array(unit.enumerated()), id: \.offset) { _, token in tokenView(token) }
                        }
                        .layoutValue(key: DocumentSpace.self, value: Self.isSpace(unit))
                    }
                }
                .frame(minHeight: 22, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paper(tilt: leave ? theme.rotation("documentLeave") : theme.rotation("documentPhone"), size: .large)
        .animation(reduceMotion ? nil : theme.curve("standard", duration: "docTilt"), value: leave)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(leave ? "preview.skeleton" : "preview.original")
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

    @ViewBuilder private func tokenView(_ token: Token) -> some View {
        switch token {
        case .text(let s):
            Text(verbatim: s).type(.monoDocument).foregroundStyle(theme.onPaper).accessibilityHidden(s.trimmingCharacters(in: .whitespaces).isEmpty)
        case .word(let w):
            if leave {
                Button { hide(w) } label: {
                    Text(verbatim: w).type(.monoDocument).foregroundStyle(theme.onPaper)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(w)
                .accessibilityHint(model.t("preview.hideWord", ["word": w]))
                .accessibilityRemoveTraits(.isButton)
                .accessibilityAddTraits(.isLink)
            } else {
                Text(verbatim: w).type(.monoDocument).foregroundStyle(theme.onPaper)
            }
        case .value(let id, let original, let order):
            let mine = hidden.contains(original.lowercased())
            let delay = reduceMotion ? 0 : min(Double(order) * theme.delay("tokenStagger"), 0.9)
            ZStack(alignment: .leading) {
                Text(verbatim: original).type(.monoDocument).foregroundStyle(theme.onPaper).underline()
                    .opacity(leave ? 0 : 1)
                PlaceholderBar(id: id, mine: mine)
                    .opacity(leave ? 1 : 0)
            }
            .padding(.trailing, 2)
            .animation(reduceMotion ? nil : theme.curve("fade", duration: "tokenFade").delay(delay), value: leave)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(leave ? model.t(PlaceholderBar.labelKey(id)) + " \(id)" : original)
        }
    }
}

/// Marks a run of spaces in a document line: it may end a row but never starts a wrapped one.
private struct DocumentSpace: LayoutValueKey { static let defaultValue = false }

/// One document line: pieces side by side, wrapping between pieces; wrapped rows are indented and a
/// run of spaces at the start of a wrapped row takes no room.
private struct DocumentLineLayout: Layout {
    var indent: CGFloat
    var lineSpacing: CGFloat

    private func rows(_ width: CGFloat, _ subviews: Subviews) -> [(index: Int, x: CGFloat, row: Int, size: CGSize, collapsed: Bool)] {
        var out: [(Int, CGFloat, Int, CGSize, Bool)] = []
        var x: CGFloat = 0, row = 0
        for (i, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            let space = view[DocumentSpace.self]
            let start: CGFloat = row == 0 ? 0 : indent
            if !space && x > start && x + size.width > width { row += 1; x = indent }
            let collapsed = space && row > 0 && x == indent
            out.append((i, x, row, size, collapsed))
            if !collapsed { x += size.width }
        }
        return out
    }

    func sizeThatFits(proposal offered: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = offered.width ?? .infinity
        let placed = rows(width, subviews)
        var heights: [Int: CGFloat] = [:]
        var widest: CGFloat = 0
        for p in placed { heights[p.row] = max(heights[p.row] ?? 0, p.size.height); if !p.collapsed { widest = max(widest, p.x + p.size.width) } }
        let total = heights.values.reduce(0, +) + lineSpacing * CGFloat(max(0, heights.count - 1))
        return CGSize(width: width.isFinite ? width : widest, height: total)
    }

    func placeSubviews(in bounds: CGRect, proposal offered: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let placed = rows(bounds.width, subviews)
        var heights: [Int: CGFloat] = [:]
        for p in placed { heights[p.row] = max(heights[p.row] ?? 0, p.size.height) }
        var tops: [Int: CGFloat] = [:]
        var y = bounds.minY
        for row in heights.keys.sorted() { tops[row] = y; y += (heights[row] ?? 0) + lineSpacing }
        for p in placed {
            let rowHeight = heights[p.row] ?? p.size.height
            subviews[p.index].place(at: CGPoint(x: bounds.minX + p.x, y: (tops[p.row] ?? bounds.minY) + (rowHeight - p.size.height) / 2),
                                    proposal: ProposedViewSize(p.collapsed ? CGSize(width: 0, height: p.size.height) : p.size))
        }
    }
}
