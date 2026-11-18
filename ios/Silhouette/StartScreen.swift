// Start: the ink hero with the wordmark, For judges and the language, the headline and the
// promise; the example of what stays and what could leave; the way in.

import SilhouetteKit
import SwiftUI

struct StartScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var height: CGFloat = 874

    /// A short screen (iPhone SE): a smaller headline and the lead's first sentence, so the way in stays
    /// in the first screen.
    private var short: Bool { height < 720 }

    /// On a short screen a long headline (Spanish) takes a smaller size, so it stays at three lines.
    private var titleSize: CGFloat {
        guard short else { return 56 }
        return model.t("start.title").count > 44 ? 32 : 40
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Hero(title: model.t("start.title"), size: titleSize,
                     lead: short ? model.t("start.promiseShort") : "\(model.t("start.leadShort")) \(model.t("start.promiseShort"))", titleId: "start.title") {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Wordmark().fixedSize()
                            Spacer(minLength: 4)
                            GlassCapsule(label: model.t("rail.judges"), id: "judges.open") { model.open(.judges) }
                            LanguageButton()
                        }
                        DraftLine(onHero: true)
                    }
                }
                VStack(alignment: .leading, spacing: 16) {
                    if let notice = model.notice {
                        NoticeCard(text: model.t(notice), systemImage: "checkmark.circle")
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("start.notice")
                            .onAppear { AccessibilityNotification.Announcement(model.t(notice)).post() }
                    }
                    ExampleCard()
                    VStack(spacing: 4) {
                        if !pinPrimary { primary }
                        SecondaryButton(label: model.t("sample.try"), filled: false, id: "start.sample") { model.openDocument() }
                        if model.session.isStarted {
                            LinkText(label: model.t("start.restart"), id: "start.restart") { model.restart() }
                        }
                    }
                    NoteText(text: model.t("promise.line3"), size: 12)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                .gutter()
            }
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if pinPrimary {
                primary
                    .gutter()
                    .padding(.top, 8)
                    .background(theme.ground)
            }
        }
        .heroScreen(theme)
        .onGeometryChange(for: CGFloat.self) { $0.size.height + $0.safeAreaInsets.top + $0.safeAreaInsets.bottom } action: { height = $0 }
    }

    /// On a short screen the way in is pinned above the bars, so it is always in the first screen.
    private var pinPrimary: Bool { short && !typeSize.isAccessibilitySize }

    private var primary: some View {
        PrimaryButton(label: startLabel, id: "start.begin") { model.begin() }
    }

    /// Not started: begin. Started but unfinished: continue the check. Finished: see results.
    private var startLabel: String {
        guard model.session.isStarted else { return model.t("start.begin") }
        return model.session.firstOpenIndex < model.session.steps.count ? model.t("start.resume") : model.t("start.continue")
    }
}

/// The example: the same paystub line on this iPhone and as it could leave (token chips).
private struct ExampleCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                Label(model.t("preview.onPhone"), systemImage: "iphone").frame(maxWidth: .infinity, alignment: .leading)
                Label(model.t("preview.couldLeave"), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 14)
            }
            .sfFont(13, weight: .semibold)
            .foregroundStyle(theme.ink)
            .labelStyle(SmallIconLabel())
            .frame(minHeight: 32)
            row(label: model.t("field.paystub.employerName"), value: "NORTHWIND STAFFING", tokens: ["W1", "W2"])
            RowDivider(inset: 0)
            row(label: model.t("field.paystub.grossPay"), value: "1,271.88", tokens: ["N12"])
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(theme.cardBorder, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(model.t("promise.line1")) \(model.t("promise.line2"))")
        .accessibilityAddTraits(.isImage)
    }

    private func row(label: String, value: String, tokens: [String]) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 1) {
                Text(label).sfFont(12).foregroundStyle(theme.note)
                Text(value).sfFont(15, weight: .semibold).foregroundStyle(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 4) { ForEach(tokens, id: \.self) { TokenChip(id: $0, size: 13) } }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 14)
                .frame(maxHeight: .infinity)
                .overlay(alignment: .leading) { Rectangle().fill(theme.line.opacity(0.7)).frame(width: 0.5) }
        }
        .frame(minHeight: 44)
    }
}

/// A label with a 12 pt icon.
struct SmallIconLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.sfFont(12, weight: .semibold)
            configuration.title
        }
    }
}

/// The draft notice on every screen: "Draft rules, read {date}." and More (the draft-rules sheet).
struct DraftLine: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    var onHero = false

    var body: some View {
        let info = model.bundle.packInfo
        if info.isDemo || info.isDraft {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(info.isDraft ? model.t("pack.draft.short", ["date": model.draftDate]) : model.t("demo.short"))
                    .sfFont(13)
                    .foregroundStyle(onHero ? theme.onHeroMuted : theme.note)
                    .fixedSize(horizontal: false, vertical: true)
                Button { model.sheet = .demo } label: {
                    Text(model.t("demo.more"))
                        .sfFont(13, weight: .semibold)
                        .underline(true, color: onHero ? .white.opacity(0.35) : theme.underline)
                        .foregroundStyle(onHero ? .white : theme.ink)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -12)
                .accessibilityIdentifier("demo.more")
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(info.isDraft ? model.t("pack.draft.title") : model.t("demo.title"))
            .accessibilityIdentifier("demo.banner")
        }
    }
}
