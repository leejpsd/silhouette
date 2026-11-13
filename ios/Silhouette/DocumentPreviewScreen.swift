// The silhouette before anything could leave: compare it with the document as it reads on this
// phone, hide more words (every occurrence, whole phrase), undo, and read it.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct DocumentPreviewScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @State private var view = Mode.leave
    @State private var reading = false

    enum Mode: Hashable { case leave, phone }

    var body: some View {
        ScreenScroll {
            ScreenHeading(text: model.t("preview.title")).accessibilityIdentifier("preview.title")
            if let silhouette = model.silhouette {
                Text(model.t("preview.lead")).tokenFont(.body).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                let counts = DocumentSession.counts(silhouette)
                Text(model.t("preview.counts", ["numbers": String(counts.numbers), "dates": String(counts.dates), "words": String(counts.words)]))
                    .tokenFont(.bodyStrong)
                    .accessibilityIdentifier("preview.counts")
                Picker(model.t("preview.title"), selection: $view) {
                    Text(model.t("preview.couldLeave")).tag(Mode.leave)
                    Text(model.t("preview.onPhone")).tag(Mode.phone)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("preview.mode")

                Group {
                    if view == .leave {
                        Text(leaveText(DocumentSession.segments(of: silhouette.skeleton)))
                            .environment(\.openURL, OpenURLAction { url in
                                guard url.scheme == "hide", let word = url.host(percentEncoded: false) else { return .discarded }
                                model.hideWord(word)
                                return .handled
                            })
                            .accessibilityIdentifier("preview.skeleton")
                    } else {
                        Text(phoneText(DocumentSession.segments(of: silhouette)))
                            .accessibilityIdentifier("preview.original")
                    }
                }
                .font(.system(.callout, design: .monospaced))
                .foregroundStyle(theme.text)
                .textSelection(.disabled)
                .padding(theme.space("sm"))
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))

                if view == .leave {
                    Text(model.t("preview.hideHelp")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                }
                hiddenWords
                reader(silhouette)
            } else {
                Text(model.t("preview.missing")).tokenFont(.body)
            }
        }
    }

    /// What could leave: placeholders as sent; each visible word is a link that hides it.
    private func leaveText(_ segments: [PreviewSegment]) -> AttributedString {
        var out = AttributedString()
        for seg in segments {
            switch seg {
            case .text(let s): out += AttributedString(s)
            case .word(let w):
                var a = AttributedString(w)
                if let url = URL(string: "hide://\(w.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")") {
                    a.link = url
                    a.foregroundColor = theme.primary
                    a.underlineStyle = .single
                }
                out += a
            case .placeholder(let id, _, _):
                var a = AttributedString("\u{27E6}\(id)\u{27E7}")
                a.backgroundColor = theme.privateFill
                a.foregroundColor = theme.onPrivate
                out += a
            }
        }
        return out
    }

    /// On this phone: the document with every masked value shown and marked.
    private func phoneText(_ segments: [PreviewSegment]) -> AttributedString {
        var out = AttributedString()
        for seg in segments {
            switch seg {
            case .text(let s), .word(let s): out += AttributedString(s)
            case .placeholder(_, _, let original):
                var a = AttributedString(original ?? "")
                a.backgroundColor = theme.privateFill
                a.foregroundColor = theme.onPrivate
                out += a
            }
        }
        return out
    }

    @ViewBuilder private var hiddenWords: some View {
        let hidden = model.document.hiddenWordsForDisplay
        if !hidden.isEmpty {
            VStack(alignment: .leading, spacing: theme.space("xs")) {
                Text(model.t("preview.hidden")).tokenFont(.bodyStrong).accessibilityAddTraits(.isHeader)
                ForEach(hidden, id: \.self) { word in
                    Button(model.t("preview.unhide", ["word": word])) { model.unhideWord(word) }
                        .buttonStyle(.quietAction)
                        .accessibilityIdentifier("preview.unhide.\(word)")
                }
                Button(model.t("preview.undo")) { if let last = hidden.last { model.unhideWord(last) } }
                    .buttonStyle(.secondaryAction)
                    .accessibilityIdentifier("preview.undo")
            }
        }
    }

    @ViewBuilder private func reader(_ silhouette: SkeletonResult) -> some View {
        let extractor = model.documentExtractor
        if extractor is ModelPointerExtractor {
            // A model reads the silhouette: on this device first, or in the cloud when this device
            // has no model. What could leave is exactly the silhouette shown above.
            VStack(alignment: .leading, spacing: theme.space("sm")) {
                Text(model.t(model.deviceModelAvailable ? "preview.onDevice" : "preview.cloud")).tokenFont(.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("preview.modelLead")
                ProvenanceBadge(source: model.deviceModelAvailable ? .onDevice : .inCloud, reason: .documentSilhouetteOnly,
                                noDeviceModel: !model.deviceModelAvailable)
                if let error = model.documentError {
                    Text(model.t(error.copyKey)).tokenFont(.small).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("preview.error")
                }
                if reading {
                    HStack { ProgressView(); Text(model.t("preview.sending")).tokenFont(.small) }
                } else {
                    Button(model.t("send.send")) {
                        reading = true
                        Task { await model.readDocument(); reading = false }
                    }
                    .buttonStyle(.primaryAction)
                    .accessibilityIdentifier("preview.send")
                    Button(model.t("send.skip")) { model.typeNumbers() }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("preview.keep")
                }
            }
        } else if extractor != nil {
            VStack(alignment: .leading, spacing: theme.space("sm")) {
                SourceBadge(text: model.t("badge.sampleKey"), reason: model.t(RoutingReason.sampleAnswerKey.copyKey))
                Text(model.t("preview.sample")).tokenFont(.body).fixedSize(horizontal: false, vertical: true)
                Button(model.t("preview.sampleButton")) {
                    reading = true
                    Task { await model.readDocument(); reading = false }
                }
                .buttonStyle(.primaryAction)
                .disabled(reading)
                .accessibilityIdentifier("preview.sampleButton")
            }
        } else {
            VStack(alignment: .leading, spacing: theme.space("sm")) {
                Text(model.t("preview.noExtractor")).tokenFont(.body).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("preview.noExtractor")
                Button(model.t("doc.manual")) { model.typeNumbers() }
                    .buttonStyle(.primaryAction)
                    .accessibilityIdentifier("preview.manual")
            }
        }
    }
}

/// Where a result came from, with the routing reason.
struct SourceBadge: View {
    @Environment(\.theme) private var theme
    let text: String
    let reason: String

    var body: some View {
        HStack(spacing: theme.space("xs")) {
            Image(systemName: "doc.text.magnifyingglass").accessibilityHidden(true)
            Text("\(text) · \(reason)").fixedSize(horizontal: false, vertical: true)
        }
        .tokenFont(.small)
        .foregroundStyle(theme.onNotice)
        .padding(.horizontal, theme.space("sm"))
        .padding(.vertical, theme.space("xxs"))
        .background(theme.notice, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("source.badge")
    }
}
