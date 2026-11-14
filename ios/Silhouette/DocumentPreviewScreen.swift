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
                LoadingLines(text: model.t("preview.sending")).padding(.horizontal, 6).padding(.vertical, 8)
            } else {
                HStack(spacing: 10) {
                    Button(model.t("send.skip")) { model.typeNumbers() }
                        .buttonStyle(OutlineStyle(large: true, fullWidth: true))
                        .accessibilityIdentifier("preview.keep")
                    SendButton(label: model.t("send.send"), id: "preview.send") {
                        reading = true
                        Task { await model.readDocument(); reading = false }
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
                FlowLayout(spacing: 0, lineSpacing: 2) {
                    ForEach(Array(line.enumerated()), id: \.offset) { _, token in tokenView(token) }
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

    /// Lines of tokens; text is split after spaces so a line can wrap.
    static func lines(_ segments: [PreviewSegment]) -> [[Token]] {
        var lines: [[Token]] = [[]]
        var order = 0
        func addText(_ s: String) {
            let parts = s.components(separatedBy: "\n")
            for (i, part) in parts.enumerated() {
                if i > 0 { lines.append([]) }
                var chunk = ""
                for ch in part {
                    chunk.append(ch)
                    if ch == " " { lines[lines.count - 1].append(.text(chunk)); chunk = "" }
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
