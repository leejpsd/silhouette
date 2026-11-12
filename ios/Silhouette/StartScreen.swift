// Start: the promise, the rules in use, and the way in.

import SilhouetteKit
import SwiftUI

struct StartScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        ScreenScroll {
            if let notice = model.notice {
                Text(model.t(notice))
                    .tokenFont(.bodyStrong)
                    .foregroundStyle(theme.text)
                    .padding(theme.space("sm"))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                    .overlay(RoundedRectangle(cornerRadius: theme.radius("control")).strokeBorder(theme.border, lineWidth: 1))
                    .accessibilityIdentifier("start.notice")
                    .onAppear { AccessibilityNotification.Announcement(model.t(notice)).post() }
            }
            SilhouetteMark(style: .brand, size: 88)
                .padding(.top, theme.space("xs"))
            ScreenHeading(text: model.t("start.title"), style: .display)
                .accessibilityIdentifier("start.title")
            Text(model.t("start.lead"))
                .tokenFont(.body)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: theme.space("sm")) {
                PromiseLine(symbol: "iphone", text: model.t("promise.line1"))
                PromiseLine(symbol: "person.crop.circle.dashed", text: model.t("promise.line2"))
            }
            .padding(theme.space("md"))
            .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("panel")))
            Text(model.t("start.rules", ["name": model.t("pack.\(model.bundle.packInfo.jurisdiction).name")]))
                .tokenFont(.small)
                .foregroundStyle(theme.textMuted)
            VStack(spacing: theme.space("sm")) {
                Button(startLabel) { model.begin() }
                    .buttonStyle(.primaryAction)
                    .accessibilityIdentifier("start.begin")
                if model.session.isStarted {
                    Button(model.t("start.restart")) { model.restart() }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("start.restart")
                }
            }
            .padding(.top, theme.space("xs"))
            AppFooter()
        }
    }
}

extension StartScreen {
    /// Not started: begin. Started but unfinished: continue the check. Finished: see results.
    private var startLabel: String {
        guard model.session.isStarted else { return model.t("start.begin") }
        return model.session.firstOpenIndex < model.session.steps.count ? model.t("start.resume") : model.t("start.continue")
    }
}

private struct PromiseLine: View {
    @Environment(\.theme) private var theme
    let symbol: String
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: theme.space("sm")) {
            Image(systemName: symbol).foregroundStyle(theme.primary).frame(minWidth: 24).accessibilityHidden(true)
            Text(text).tokenFont(.body).foregroundStyle(theme.text).fixedSize(horizontal: false, vertical: true)
        }
    }
}
