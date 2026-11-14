// Add a paystub: a photo (read only on this device, not available in this version), a PDF with a
// text layer, pasted or shared text, or typing the numbers; the built-in samples sit in the block.
// The document language (its allowlist ∪ en) is chosen here, independent of the app's.

import PDFKit
import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UniformTypeIdentifiers

struct DocumentAddScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    @State private var pasted = ""
    @State private var choosingPDF = false
    @State private var pdfError = false
    @State private var photoInfo = false
    @State private var pasting = false

    var body: some View {
        Screen {
            BackLink(label: model.backLabel) { if !model.path.isEmpty { model.path.removeLast() } }
                .padding(.bottom, -8)
            DisplayHeadline(text: model.t("doc.title"), role: .title, size: 50, maxLines: 3)
                .accessibilityIdentifier("doc.title")
                .appear(.rise)
            Para(model.t("doc.lead"))
            if model.document.confirmedStubCount > 0 {
                Para(model.t("review.stubsCount", ["count": String(model.document.confirmedStubCount)]), .small)
            }
            languagePicker
            readingStatus

            OptionCard(symbol: "doc.text", title: model.t("doc.pdf"), help: model.t("doc.pdf.help"), id: "doc.pdf") {
                choosingPDF = true
            } extra: {
                if pdfError {
                    Label(model.t("doc.pdf.error"), systemImage: "exclamationmark.triangle")
                        .type(.label, size: 13.5).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            }

            OptionCard(symbol: "doc.on.clipboard", title: model.t("doc.paste"), help: "",
                       id: "doc.paste", open: pasting) {
                withAnimation(theme.curve("standard", duration: "medium")) { pasting.toggle() }
            } extra: {
                if pasting {
                    TextEditor(text: $pasted)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 120)
                        .fieldStyle(mono: true)
                        .accessibilityLabel(model.t("doc.paste.label"))
                        .accessibilityIdentifier("doc.paste.text")
                        .toolbar {
                            // Return types a new line; continuing stays one tap away above the keyboard.
                            ToolbarItemGroup(placement: .keyboard) {
                                Spacer()
                                Button(model.t("doc.paste.continue")) { model.useDocumentText(Raw(pasted), source: .paste) }
                                    .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                    .accessibilityIdentifier("doc.paste.keyboardContinue")
                            }
                        }
                    HStack(spacing: 10) {
                        PasteButton(payloadType: String.self) { strings in
                            Task { @MainActor in pasted = strings.joined(separator: "\n") }
                        }
                        .labelStyle(.titleAndIcon)
                        .tint(theme.ink)
                        Button(model.t("doc.paste.continue")) { model.useDocumentText(Raw(pasted), source: .paste) }
                            .buttonStyle(OutlineStyle())
                            .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .accessibilityIdentifier("doc.paste.continue")
                    }
                }
            }

            OptionCard(symbol: "keyboard", title: model.t("doc.manual"), help: model.t("review.manualLead"), id: "doc.manual") {
                model.typeNumbers()
            }

            // Photos are read only by an on-device model, which this version does not use: dashed.
            OptionCard(symbol: "camera", title: model.t("doc.photo"), help: model.t(photoInfo ? "doc.photo.unavailable" : "doc.photo.staysHere"),
                       id: "doc.photo", dashed: true) {
                photoInfo = true
            } extra: {
                if photoInfo { Color.clear.frame(height: 0).accessibilityIdentifier("doc.photo.unavailable") }
            }
        } actions: {
            Text(model.t("doc.samples")).type(.control).foregroundStyle(theme.onBlock).accessibilityAddTraits(.isHeader)
                .padding(.horizontal, 4)
            Text(model.t("doc.samples.help")).type(.caption).foregroundStyle(theme.onBlockMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
            LazyVGrid(columns: dynamicType.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.flexible(), spacing: 8), GridItem(.flexible())],
                      spacing: 8) {
                ForEach(model.bundle.samples) { sample in
                    Button(model.t(sample.titleKey)) { model.useDocumentText(sample.text, source: .sample, sample: sample) }
                        .buttonStyle(OutlineStyle(fullWidth: true))
                        .accessibilityIdentifier("doc.sample.\(sample.id)")
                }
            }
            .padding(.bottom, 6)
        }
        .fileImporter(isPresented: $choosingPDF, allowedContentTypes: [.pdf]) { result in
            guard case .success(let url) = result, let text = Self.pdfText(url) else { pdfError = true; return }
            pdfError = false
            model.useDocumentText(Raw(text), source: .pdf)
        }
    }

    /// Where documents are read: on this device when it has a model, otherwise the silhouette in the cloud.
    private var readingStatus: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: model.deviceModelAvailable ? "iphone" : "cloud")
                .font(.system(size: 13, weight: .semibold)).frame(width: 18).accessibilityHidden(true)
            Text("\(Text(model.deviceModelAvailable ? model.t("badge.onDevice") : model.t("model.title")).bold()) · \(model.t(model.deviceModelAvailable ? "model.available" : "model.device.unavailable"))")
                .fixedSize(horizontal: false, vertical: true)
        }
        .type(.small)
        .foregroundStyle(theme.ink)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("doc.reading")
    }

    private var languagePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(model.t("doc.language")).type(.label).foregroundStyle(theme.ink)
            Menu {
                ForEach(AppLocale.allCases) { locale in
                    Button {
                        model.setDocumentLanguage(locale)
                    } label: {
                        if locale == model.document.language { Label(locale.nativeName, systemImage: "checkmark") } else { Text(locale.nativeName) }
                    }
                }
            } label: {
                HStack {
                    Text(model.document.language.nativeName).type(.body)
                    Spacer()
                    Image(systemName: "chevron.down").font(.system(size: 13, weight: .bold)).accessibilityHidden(true)
                }
                .foregroundStyle(theme.ink)
                .fieldStyle(mono: false)
                .contentShape(Rectangle())
            }
            .accessibilityLabel(model.t("doc.language"))
            .accessibilityValue(model.document.language.nativeName)
            .accessibilityIdentifier("doc.language")
        }
    }

    /// The PDF's text layer, read on this device (deterministic; no OCR).
    static func pdfText(_ url: URL) -> String? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let pdf = PDFDocument(url: url) else { return nil }
        let pages = (0..<pdf.pageCount).compactMap { pdf.page(at: $0)?.string }
        let text = pages.joined(separator: "\n")
        return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text
    }
}

/// A way to add a document: an icon in a circle, the title in Darker Grotesque 30 and a line of help,
/// with a chevron; the whole card is the button. Dashed when it is not available on this device.
private struct OptionCard<Extra: View>: View {
    @Environment(\.theme) private var theme
    let symbol: String
    let title: String
    let help: String
    let id: String
    var dashed = false
    var open = false
    let action: () -> Void
    @ViewBuilder var extra: Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(action: action) {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: symbol)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(theme.ink)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(theme.card))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        DisplayLabel(text: title, role: .optionWord, size: 26, maxLines: 3, color: theme.ink, singleLineFirst: false)
                        if !help.isEmpty {
                            Text(help).type(.caption).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: open ? "chevron.down" : "chevron.right")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(theme.ink)
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(help.isEmpty ? title : "\(title). \(help)")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier(id)
            extra
        }
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: theme.radius("option"))
            .strokeBorder(theme.ink, style: StrokeStyle(lineWidth: theme.border, dash: dashed ? [5, 4] : [])))
        .accessibilityElement(children: .contain)
    }
}

extension OptionCard where Extra == EmptyView {
    init(symbol: String, title: String, help: String, id: String, dashed: Bool = false, action: @escaping () -> Void) {
        self.init(symbol: symbol, title: title, help: help, id: id, dashed: dashed, action: action) { EmptyView() }
    }
}

extension AppModel {
    /// "Back to results" when the screen below is Results, otherwise "Back".
    var backLabel: String {
        path.count >= 2 && path[path.count - 2] == .results ? t("detail.back") : t("q.back")
    }
}
