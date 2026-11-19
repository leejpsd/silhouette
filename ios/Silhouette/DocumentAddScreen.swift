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
    @Environment(\.dynamicTypeSize) private var dynamicType
    @State private var pasted = ""
    @State private var choosingPDF = false
    @State private var pdfError = false
    @State private var photoInfo = false
    @State private var pasting = false
    @FocusState private var pasteFocused: Bool
    @State private var moreSamples = false

    var body: some View {
        RevealingScroll {
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
                    }
                }
                VStack(alignment: .leading, spacing: 16) {
                    DraftLine()
                    if model.document.confirmedStubCount > 0 {
                        NoteText(text: model.t("review.stubsCount", ["count": String(model.document.confirmedStubCount)]), size: 15)
                    }
                    languageRow
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("doc.language")
                    readingStatus
                    sampleCard
                    ListCard {
                        Button { choosingPDF = true } label: {
                            ListRow(title: model.t("doc.pdf"), subtitle: model.t("doc.pdf.short"), leading: { IconTile(systemImage: "doc.richtext") })
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("doc.pdf")
                        if pdfError { NoticeCard(text: model.t("doc.pdf.error")).padding(.horizontal, 16).padding(.bottom, 12) }
                        RowDivider(inset: 64)
                        Button {
                            withMotion(Motion.reveal) { pasting.toggle() }
                            pasteFocused = pasting
                        } label: {
                            ListRow(title: model.t("doc.paste"), subtitle: model.t("doc.paste.short"), leading: { IconTile(systemImage: "doc.on.clipboard") })
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("doc.paste")
                        if pasting { pasteBox.padding(.horizontal, 16).padding(.bottom, 12).revealsIntoView().transition(Motion.revealTransition) }
                        RowDivider(inset: 64)
                        Button { model.typeNumbers() } label: {
                            ListRow(title: model.t("doc.manual"), subtitle: model.t("doc.manual.short"), leading: { IconTile(systemImage: "character.cursor.ibeam") })
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("doc.manual")
                        moreSampleRows
                        RowDivider(inset: 64)
                        // Photos are read only by an on-device model that takes images; this iPhone's takes text only.
                        Button { withMotion(Motion.reveal) { photoInfo.toggle() } } label: {
                            ListRow(title: model.t("doc.photo"), subtitle: model.t(photoInfo ? "doc.photo.unavailable" : "doc.photo.notHere"),
                                    chevron: false, dimmed: true, leading: { IconTile(systemImage: "camera").opacity(0.5) })
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("doc.photo")
                        .overlay { if photoInfo { Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("doc.photo.unavailable") } }
                    }
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

    /// The sample paystub in the chosen language (or the first one): the screen's ink card.
    private var sample: SampleDocument? {
        model.bundle.samples.first { $0.language == model.document.language } ?? model.bundle.samples.first
    }

    /// The most prominent card: something that works on every iPhone, the sample paystub.
    @ViewBuilder private var sampleCard: some View {
        if let sample {
            Button { model.useDocumentText(sample.text, source: .sample, sample: sample) } label: {
                HStack(spacing: 14) {
                    Image(systemName: "doc.text.magnifyingglass").sfFont(18, weight: .semibold)
                        .frame(width: 44, height: 44).background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.12)))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.t("sample.try")).sfFont(17, weight: .semibold)
                        Text(model.t(sample.titleKey)).sfFont(13).foregroundStyle(theme.onHeroMuted).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").sfFont(14, weight: .semibold).foregroundStyle(theme.onHeroMuted)
                }
                .foregroundStyle(.white)
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 24).fill(theme.hero))
                .contentShape(RoundedRectangle(cornerRadius: 24))
            }
            .buttonStyle(PressScale())
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("doc.sample.\(sample.id)")
        }
    }

    /// "Paystub language" and the picker on one line; stacked at accessibility sizes, or when the
    /// line cannot hold both whole (large text on a small iPhone).
    @ViewBuilder private var languageRow: some View {
        let label = Text(model.t("doc.languageShort")).sfFont(15).foregroundStyle(theme.note).lineLimit(1).fixedSize()
        let picker = Segmented(options: AppLocale.offered.map { ($0, $0.nativeName, "doc.language.\($0.rawValue)") },
                               selection: Binding(get: { model.document.language }, set: { model.setDocumentLanguage($0) }))
        let stacked = VStack(alignment: .leading, spacing: 8) {
            Text(model.t("doc.languageShort")).sfFont(15).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
            picker
        }
        if dynamicType.isAccessibilitySize {
            stacked
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { label; picker }
                stacked
            }
        }
    }

    private var pasteBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextEditor(text: $pasted)
                .focused($pasteFocused)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .textContentType(nil)
                .scrollContentBackground(.hidden)
                .monoFont(13, weight: 400)
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
                    .sfFont(17, weight: .semibold)
                    .foregroundStyle(theme.ink)
                    .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("doc.paste.continue")
            }
        }
    }

    /// The other built-in samples, as a row of the list that opens to show them.
    @ViewBuilder private var moreSampleRows: some View {
        let others = model.bundle.samples.filter { $0.id != sample?.id }
        if !others.isEmpty {
            RowDivider(inset: 64)
            Button { withMotion(Motion.reveal) { moreSamples.toggle() } } label: {
                ListRow(title: model.t("doc.moreSamples"), subtitle: model.t("doc.samples.help"), chevron: false,
                        leading: { IconTile(systemImage: "doc.on.doc") }) {
                    Image(systemName: moreSamples ? "chevron.down" : "chevron.right").sfFont(14, weight: .semibold).foregroundStyle(theme.icon)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("doc.moreSamples")
            if moreSamples {
              VStack(spacing: 0) {
                ForEach(others) { other in
                    RowDivider(inset: 64)
                    Button { model.useDocumentText(other.text, source: .sample, sample: other) } label: {
                        ListRow(title: model.t(other.titleKey), titleSize: 15, leading: { Color.clear.frame(width: 36, height: 1) })
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("doc.sample.\(other.id)")
                }
              }
              .revealsIntoView()
              .transition(Motion.revealTransition)
            }
        }
    }

    /// Where documents are read, in one line: on this device when it has a model, otherwise the
    /// silhouette in the cloud.
    private var readingStatus: some View {
        HStack(alignment: .center, spacing: 8) {
            WhereBadge(kind: model.deviceModelAvailable ? .device : .cloud, label: model.t(model.deviceModelAvailable ? "badge.onDevice" : "badge.cloud"))
            Text(model.t(model.deviceModelAvailable ? "doc.where.device" : "doc.where.cloud"))
                .sfFont(13).foregroundStyle(theme.note).lineLimit(1).minimumScaleFactor(0.8)
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
