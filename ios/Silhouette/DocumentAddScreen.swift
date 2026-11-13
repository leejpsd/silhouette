// Add a paystub: paste or share text, a PDF with a text layer, a built-in sample, or typing the
// numbers. The document language (its allowlist ∪ en) is chosen here, independent of the app's.

import PDFKit
import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UniformTypeIdentifiers

struct DocumentAddScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @State private var pasted = ""
    @State private var choosingPDF = false
    @State private var pdfError = false
    @State private var photoInfo = false

    var body: some View {
        ScreenScroll {
            ScreenHeading(text: model.t("doc.title")).accessibilityIdentifier("doc.title")
            Text(model.t("doc.lead")).tokenFont(.body).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
            if model.document.confirmedStubCount > 0 {
                Text(model.t("review.stubsCount", ["count": String(model.document.confirmedStubCount)])).tokenFont(.small)
            }

            section(model.t("doc.language")) {
                Picker(model.t("doc.language"), selection: Binding(get: { model.document.language }, set: { model.setDocumentLanguage($0) })) {
                    ForEach(AppLocale.allCases) { Text($0.nativeName).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("doc.language")
            }

            section(model.t("doc.paste")) {
                TextEditor(text: $pasted)
                    .tokenFont(.body)
                    .frame(minHeight: 120)
                    .padding(theme.space("xs"))
                    .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                    .overlay(RoundedRectangle(cornerRadius: theme.radius("control")).strokeBorder(theme.borderStrong, lineWidth: 2))
                    .accessibilityLabel(model.t("doc.paste.label"))
                    .accessibilityIdentifier("doc.paste.text")
                HStack {
                    PasteButton(payloadType: String.self) { strings in
                        Task { @MainActor in pasted = strings.joined(separator: "\n") }
                    }
                    .labelStyle(.titleAndIcon)
                    Spacer()
                }
                Button(model.t("doc.paste.continue")) { model.useDocumentText(Raw(pasted), source: .paste) }
                    .buttonStyle(.primaryAction)
                    .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("doc.paste.continue")
            }

            section(model.t("doc.pdf")) {
                Text(model.t("doc.pdf.help")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                Button(model.t("doc.pdf")) { choosingPDF = true }
                    .buttonStyle(.secondaryAction)
                    .accessibilityIdentifier("doc.pdf")
                if pdfError {
                    Text(model.t("doc.pdf.error")).tokenFont(.small).foregroundStyle(theme.danger).fixedSize(horizontal: false, vertical: true)
                }
            }

            section(model.t("doc.photo")) {
                Button(model.t("doc.photo")) { photoInfo = true }
                    .buttonStyle(.secondaryAction)
                    .accessibilityIdentifier("doc.photo")
                if photoInfo {
                    // Photos are read only by an on-device model, which this version does not use.
                    Text(model.t("doc.photo.unavailable")).tokenFont(.small).foregroundStyle(theme.text).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("doc.photo.unavailable")
                }
            }

            section(model.t("doc.manual")) {
                Button(model.t("doc.manual")) { model.typeNumbers() }
                    .buttonStyle(.secondaryAction)
                    .accessibilityIdentifier("doc.manual")
            }

            section(model.t("doc.samples")) {
                Text(model.t("doc.samples.help")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                ForEach(model.bundle.samples) { sample in
                    Button(model.t(sample.titleKey)) { model.useDocumentText(sample.text, source: .sample, sample: sample) }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("doc.sample.\(sample.id)")
                }
            }
        }
        .fileImporter(isPresented: $choosingPDF, allowedContentTypes: [.pdf]) { result in
            guard case .success(let url) = result, let text = Self.pdfText(url) else { pdfError = true; return }
            pdfError = false
            model.useDocumentText(Raw(text), source: .pdf)
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

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            ScreenHeading(text: title, style: .heading)
            content()
        }
        .padding(theme.space("md"))
        .background(theme.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: theme.radius("panel")))
    }
}
