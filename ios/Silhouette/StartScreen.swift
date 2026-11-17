// Start: the promise as a picture (the same paystub kept on this phone, and as it could leave), and
// the way in.

import SilhouetteKit
import SwiftUI

struct StartScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        Screen {
            if let notice = model.notice {
                DashedNote { Text(model.t(notice)).type(.bodyStrong) }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("start.notice")
                    .onAppear { AccessibilityNotification.Announcement(model.t(notice)).post() }
            }
            VStack(alignment: .leading, spacing: 8) {
                DisplayHeadline(text: model.t("start.title"), role: .display, maxLines: 4)
                    .accessibilityIdentifier("start.title")
                    .appear(.rise)
                Para(model.t("start.lead"))
            }
            Text(model.t("start.promise"))
                .type(.bodyStrong)
                .foregroundStyle(theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("start.promise")
            VStack(alignment: .leading, spacing: 10) {
                Text(model.t("start.example").uppercased())
                    .type(.label, size: 12)
                    .tracking(1)
                    .foregroundStyle(theme.ink)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(theme.ink, lineWidth: theme.border))
                    .accessibilityHidden(true)
                PromisePicture()
            }
            .padding(.top, theme.space("xs"))
        } actions: {
            BlockAction(label: startLabel, id: "start.begin") { model.begin() }
            VStack(spacing: 0) {
                Button(model.t("sample.try")) { model.openDocument() }
                    .buttonStyle(TextLinkStyle())
                    .accessibilityIdentifier("start.sample")
                if model.session.isStarted {
                    Button(model.t("start.restart")) { model.restart() }
                        .buttonStyle(TextLinkStyle())
                        .accessibilityIdentifier("start.restart")
                }
            }
            .frame(maxWidth: .infinity)
            Text(model.t("promise.line3"))
                .type(.caption)
                .foregroundStyle(theme.onBlockMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 4)
        }
    }

    /// Not started: begin. Started but unfinished: continue the check. Finished: see results.
    private var startLabel: String {
        guard model.session.isStarted else { return model.t("start.begin") }
        return model.session.firstOpenIndex < model.session.steps.count ? model.t("start.resume") : model.t("start.continue")
    }
}

/// Two paper slips: the paystub as it reads on this phone, and what could leave (bars and a range).
private struct PromisePicture: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    static let exampleIncome = 29183.0

    /// The example's yearly income as it could leave: the pack's own range around it.
    private var exampleBand: String {
        let band = model.bundle.bands.annualIncome.first { Double($0.min) <= Self.exampleIncome && ($0.max.map { Self.exampleIncome <= Double($0) } ?? true) }
        return band.map { model.bundle.copy.bandLabel($0, model.locale, currency: model.bundle.packInfo.currency, format: model.bundle.packInfo.numberFormat) }
            ?? model.money(Self.exampleIncome)
    }

    var body: some View {
        let household = model.t("variable.householdSize")
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text(model.t("preview.onPhone")).type(.label).foregroundStyle(theme.ink)
                VStack(alignment: .leading, spacing: 8) {
                    PaperField(label: model.t("field.paystub.employerName"), value: "NORTHWIND STAFFING")
                    PaperField(label: model.t("field.paystub.grossPay"), value: "1,271.88")
                    PaperField(label: model.t("review.annualTitle"), value: model.money(Self.exampleIncome))
                    PaperField(label: household, value: "3")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .paper(tilt: theme.rotation("paperLeft"))
            }
            .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: 6) {
                Text(model.t("preview.couldLeave"))
                    .type(.label)
                    .foregroundStyle(theme.onLeave)
                    .padding(.horizontal, 5)
                    .background(RoundedRectangle(cornerRadius: 2).fill(theme.leave))
                    .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(theme.leaveFocus, lineWidth: theme.border))
                VStack(alignment: .leading, spacing: 8) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(model.t("field.paystub.employerName")).type(.caption, size: 12).foregroundStyle(theme.onPaperMuted)
                        HStack(spacing: 6) {
                            PlaceholderBar(id: "W1", width: 60).appear(.wipe, delay: 0.2)
                            PlaceholderBar(id: "W2", width: 52).appear(.wipe, delay: 0.3)
                        }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(model.t("field.paystub.grossPay")).type(.caption, size: 12).foregroundStyle(theme.onPaperMuted)
                        PlaceholderBar(id: "N12", width: 56).appear(.wipe, delay: 0.4)
                    }
                    PaperField(label: model.t("review.annualTitle"), value: exampleBand)
                    PaperField(label: household, value: "3")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .paper(tilt: theme.rotation("paperRight"))
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(model.t("promise.line1")) \(model.t("promise.line2"))")
        .accessibilityAddTraits(.isImage)
    }
}
