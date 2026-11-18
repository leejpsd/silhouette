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
    @State private var leave = true
    @State private var reading = false

    private func read(keep: Bool) {
        reading = true
        Task { await model.readDocument(keepOnDevice: keep); reading = false }
    }

    var body: some View {
        ScrollView {
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
                        DraftLine(onHero: true)
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    if let silhouette = model.silhouette {
                        Segmented(options: [(false, model.t("preview.onPhone"), "preview.mode.phone"), (true, model.t("preview.couldLeave"), "preview.mode.leave")],
                                  selection: $leave, dotFor: true)
                            .accessibilityElement(children: .contain)
                            .accessibilityIdentifier("preview.mode")
                        let counts = DocumentSession.counts(silhouette)
                        DocumentCard(segments: DocumentSession.segments(of: silhouette), leave: leave,
                                     hidden: Set(model.document.hiddenWordsForDisplay.map { $0.lowercased() }),
                                     counts: model.t("preview.counts", ["numbers": String(counts.numbers), "dates": String(counts.dates), "words": String(counts.words)])) { word in
                            model.hideWord(word)
                        }
                        if leave { NoteText(text: model.t("preview.leadShort")) }
                        NoteText(text: model.t("preview.labelsStay"))
                        hiddenWords
                    } else {
                        NoteText(text: model.t("preview.missing"), size: 15)
                    }
                    if model.silhouette != nil { decision.padding(.top, 8) }
                }
                .gutter()
            }
            .padding(.bottom, 24)
        }
        .heroScreen(theme)
    }

    @ViewBuilder private var hiddenWords: some View {
        let hidden = model.document.hiddenWordsForDisplay
        if !hidden.isEmpty {
            Card {
                Text(model.t("preview.hidden")).font(.system(size: 15, weight: .semibold)).foregroundStyle(theme.ink).accessibilityAddTraits(.isHeader)
                ForEach(hidden, id: \.self) { word in
                    HStack {
                        Text(model.t("preview.youHid", ["word": "“\(word)”"])).font(.system(size: 15)).foregroundStyle(theme.ink)
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

    @ViewBuilder private var decision: some View {
        let extractor = model.documentExtractor
        if extractor is ModelPointerExtractor {
            // A model reads the silhouette: on this device first, or in the cloud when this device has
            // no model. What could leave is exactly the silhouette shown above.
            ProvenanceBadge(source: model.deviceModelAvailable ? .onDevice : .inCloud, reason: .documentSilhouetteOnly,
                            noDeviceModel: !model.deviceModelAvailable)
            if model.documentError?.kind == .onDeviceUnreliable {
                // Kept on the device by the person's choice, and the device could not read it reliably:
                // nothing was filled in and nothing was sent.
                NoticeCard(text: model.t("error.on-device-unreliable"))
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("preview.unreliable")
                if reading {
                    SpinnerLine(text: model.t(model.readingStage?.copyKey ?? "preview.sending"))
                } else {
                    PrimaryButton(label: model.t("preview.sendSilhouette"), sends: true, id: "preview.sendSilhouette") { read(keep: false) }
                    SecondaryButton(label: model.t("error.typeInstead"), filled: false, id: "preview.typeInstead") { model.typeNumbers() }
                }
            } else {
                NoteText(text: model.t(model.deviceModelAvailable ? "preview.onDevice" : "preview.cloud"))
                    .accessibilityIdentifier("preview.modelLead")
                if let error = model.documentError {
                    NoticeCard(text: model.t(error.copyKey)).accessibilityIdentifier("preview.error")
                }
                if reading {
                    // Which step the device is on (DEVICE_READING.md section 7).
                    SpinnerLine(text: model.t(model.readingStage?.copyKey ?? "preview.sending"))
                        .accessibilityIdentifier("preview.stage")
                } else {
                    PrimaryButton(label: model.t("preview.sendSilhouette"), sends: true, id: "preview.send") { read(keep: false) }
                    // Keep everything on this device: the device reads it when it has a model; otherwise type the numbers.
                    SecondaryButton(label: model.t("send.skip"), filled: false, id: "preview.keep") {
                        if model.deviceModelAvailable { read(keep: true) } else { model.typeNumbers() }
                    }
                }
            }
        } else if extractor != nil {
            ProvenanceBadge(source: .sampleAnswerKey, reason: .sampleAnswerKey)
            NoteText(text: model.t("preview.sample"))
            PrimaryButton(label: model.t("preview.sampleButton"), id: "preview.sampleButton") {
                reading = true
                Task { await model.readDocument(); reading = false }
            }
            .disabled(reading)
        } else {
            NoteText(text: model.t("preview.noExtractor"))
                .accessibilityIdentifier("preview.noExtractor")
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
    let counts: String
    let hide: (String) -> Void

    var body: some View {
        let lines = Self.lines(segments)
        VStack(alignment: .leading, spacing: 10) {
            Text(counts).font(.system(size: 13, weight: .semibold)).foregroundStyle(theme.note)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("preview.counts")
            ScrollView(.horizontal, showsIndicators: true) {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        HStack(spacing: 0) {
                            ForEach(Array(line.enumerated()), id: \.offset) { _, token in tokenView(token) }
                        }
                        .frame(minHeight: 22, alignment: .leading)
                    }
                }
                .padding(.bottom, 4)
            }
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(theme.cardBorder, lineWidth: 1))
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
        let mono = Font(DesignFonts.uiFont(.mono, weight: 400, size: 13))
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
        case .value(let id, let original, _):
            let mine = hidden.contains(original.lowercased())
            Group {
                if leave {
                    if mine {
                        Text(verbatim: id).font(Font(DesignFonts.uiFont(.mono, weight: 600, size: 12))).foregroundStyle(theme.ink)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(theme.ink, lineWidth: 1.25))
                            .fixedSize()
                    } else {
                        TokenChip(id: id)
                    }
                } else {
                    Text(verbatim: original).font(Font(DesignFonts.uiFont(.mono, weight: 500, size: 13))).foregroundStyle(theme.ink).fixedSize()
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
