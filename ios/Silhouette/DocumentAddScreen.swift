// Add a paystub: the hero, the document's language as a segmented control (its allowlist
// ∪ en, independent of the app's language), the photo card (on iPhone the device model takes text only,
// so it says photos are not read here yet), then a text PDF, pasted text and typing the numbers as
// rows, and the built-in sample paystubs.

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
    @State private var pasting = false
    @State private var moreSamples = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Hero(title: model.t("doc.title"), size: 54, lead: model.t("start.promiseShort"), titleId: "doc.title") {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            if !model.paystubPath.isEmpty || model.tab != .paystub {
                                GlassRound(systemImage: "chevron.left", label: model.t("q.back"), id: "doc.back") { model.back() }
                            }
                            Spacer(minLength: 0)
                            LanguageButton()
                        }
                        DraftLine(onHero: true)
                    }
                }
                VStack(alignment: .leading, spacing: 16) {
                    if model.document.confirmedStubCount > 0 {
                        NoteText(text: model.t("review.stubsCount", ["count": String(model.document.confirmedStubCount)]), size: 15)
                    }
                    HStack(spacing: 12) {
                        Text(model.t("doc.language")).font(.system(size: 15)).foregroundStyle(theme.note)
                            .fixedSize(horizontal: false, vertical: true)
                        Segmented(options: AppLocale.allCases.map { ($0, $0.nativeName, "doc.language.\($0.rawValue)") },
                                  selection: Binding(get: { model.document.language }, set: { model.setDocumentLanguage($0) }))
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("doc.language")
                    readingStatus
                    photoCard
                    ListCard {
                        Button { choosingPDF = true } label: {
                            ListRow(title: model.t("doc.pdf"), subtitle: model.t("doc.pdf.short"), leading: { IconTile(systemImage: "doc.richtext") })
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("doc.pdf")
                        if pdfError { NoticeCard(text: model.t("doc.pdf.error")).padding(.horizontal, 16).padding(.bottom, 12) }
                        RowDivider(inset: 64)
                        Button { withAnimation { pasting.toggle() } } label: {
                            ListRow(title: model.t("doc.paste"), subtitle: model.t("doc.paste.short"), leading: { IconTile(systemImage: "doc.on.clipboard") })
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("doc.paste")
                        if pasting { pasteBox.padding(.horizontal, 16).padding(.bottom, 12) }
                        RowDivider(inset: 64)
                        Button { model.typeNumbers() } label: {
                            ListRow(title: model.t("doc.manual"), subtitle: model.t("doc.manual.short"), leading: { IconTile(systemImage: "character.cursor.ibeam") })
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("doc.manual")
                    }
                    samples
                }
                .gutter()
            }
            .padding(.bottom, 24)
        }
        .heroScreen(theme)
        .fileImporter(isPresented: $choosingPDF, allowedContentTypes: [.pdf]) { result in
            guard case .success(let url) = result, let text = Self.pdfText(url) else { pdfError = true; return }
            pdfError = false
            model.useDocumentText(Raw(text), source: .pdf)
        }
    }

    /// The photo card: ink, with the honest note that photos are not read on this iPhone yet.
    private var photoCard: some View {
        Button { photoInfo = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "camera").font(.system(size: 18, weight: .semibold))
                    .frame(width: 44, height: 44).background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.t("doc.photo")).font(.system(size: 17, weight: .semibold))
                    Text(model.t(photoInfo ? "doc.photo.unavailable" : "doc.photo.notHere")).font(.system(size: 13)).foregroundStyle(theme.onHeroMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(theme.onHeroMuted)
            }
            .foregroundStyle(.white)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 24).fill(theme.hero))
            .contentShape(RoundedRectangle(cornerRadius: 24))
        }
        .buttonStyle(PressScale())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("doc.photo")
        .overlay { if photoInfo { Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("doc.photo.unavailable") } }
    }

    private var pasteBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextEditor(text: $pasted)
                .scrollContentBackground(.hidden)
                .font(Font(DesignFonts.uiFont(.mono, weight: 400, size: 13)))
                .frame(minHeight: 120)
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
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
                Spacer(minLength: 0)
                Button(model.t("doc.paste.continue")) { model.useDocumentText(Raw(pasted), source: .paste) }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(theme.ink)
                    .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("doc.paste.continue")
            }
        }
    }

    /// The built-in samples: the English sample as a text button, the others under "More samples".
    private var samples: some View {
        let all = model.bundle.samples
        return VStack(alignment: .leading, spacing: 4) {
            if let first = all.first {
                SecondaryButton(label: model.t("sample.try"), filled: false, id: "doc.sample.\(first.id)") {
                    model.useDocumentText(first.text, source: .sample, sample: first)
                }
            }
            if all.count > 1 {
                LinkText(label: model.t("doc.moreSamples"), id: "doc.moreSamples") { withAnimation { moreSamples.toggle() } }
                    .frame(maxWidth: .infinity)
                if moreSamples {
                    NoteText(text: model.t("doc.samples.help"))
                    ListCard {
                        ForEach(Array(all.dropFirst().enumerated()), id: \.element.id) { i, sample in
                            if i > 0 { RowDivider() }
                            Button { model.useDocumentText(sample.text, source: .sample, sample: sample) } label: {
                                ListRow(title: model.t(sample.titleKey), titleSize: 15)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("doc.sample.\(sample.id)")
                        }
                    }
                }
            }
        }
    }

    /// Where documents are read: on this device when it has a model, otherwise the silhouette in the cloud.
    private var readingStatus: some View {
        HStack(alignment: .center, spacing: 8) {
            WhereBadge(kind: model.deviceModelAvailable ? .device : .cloud, label: model.t(model.deviceModelAvailable ? "badge.onDevice" : "badge.cloud"))
            Text(model.t(model.deviceModelAvailable ? "model.available" : "model.device.unavailable"))
                .font(.system(size: 13)).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("doc.reading")
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
