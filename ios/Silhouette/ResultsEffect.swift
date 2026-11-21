// First on the results: whose answers they are (the prepared household is said to be a sample, contract
// v1.41) and what the paystub changed (contract v1.40): how it was read, the yearly income, the questions
// it answered, the results it changed, how the income was worked out behind a disclosure, who decided.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

/// "Sample household, not you": its answers were filled in for the demo; see or change them, or start
/// with one's own.
struct SampleHouseholdCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        Card {
            Text(model.t("results.sample.title")).sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("results.sample.title")
            NoteText(text: model.t("results.sample.lead"), size: 15).padding(.top, 4)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 20) { actions }
                VStack(alignment: .leading, spacing: 0) { actions }
            }
            .padding(.top, 2)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("results.sample")
    }

    @ViewBuilder private var actions: some View {
        LinkText(label: model.t("results.sample.see"), id: "results.sample.see") { model.editAnswers() }
        LinkText(label: model.t("results.sample.own"), id: "results.sample.own") {
            model.onJudgesPath = false
            model.restart()
        }
    }
}

/// "What your paystub changed".
struct DocumentEffectCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let effect: DocumentEffect
    @State private var howOpen = false

    var body: some View {
        Card {
            Text(model.t("results.docEffect.titlePaystub")).sfFont(20, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("results.docEffect.title")
            NoteText(text: model.t("results.incomeFrom.lead", ["how": model.t("results.incomeFrom.\(effect.incomeFromKey)")]), size: 15)
                .padding(.top, 4)
                .accessibilityIdentifier("results.incomeFrom")
            // The payoff at a glance (contract v1.44): the results without and with the paystub, both from the
            // rules on this iPhone, then what the programs that may qualify add up to in a year.
            comparison.padding(.top, 12)
            total.padding(.top, 12)
            Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5).padding(.vertical, 10)
            // The yearly income the paystub gave (the display face fills the width it is given, so "a year"
            // stands under the amount).
            VStack(alignment: .leading, spacing: 0) {
                Text(model.variableName("annualIncome")).sfFont(13, weight: .semibold).foregroundStyle(theme.note)
                Display(text: model.money(Double(effect.amount)), size: 34, maxLines: 1)
                Text(model.t("results.docEffect.year")).sfFont(15).foregroundStyle(theme.note)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("results.docEffect.amount")
            Text(model.t("results.docEffect.filled", ["count": model.number(Double(effect.filled.count)),
                                                      "list": effect.filled.map(model.variableName).joined(separator: ", ")]))
                .sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
                .accessibilityIdentifier("results.docEffect.filled")
            Group {
                if effect.changed.isEmpty {
                    NoteText(text: model.t("results.docEffect.none"), size: 15)
                } else {
                    Text(model.t("results.docEffect.changed", ["count": model.number(Double(effect.changed.count))]))
                        .sfFont(15, weight: .semibold).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 4)
            .accessibilityIdentifier("results.docEffect.changed")
            // How the yearly income was worked out, for whoever wants the arithmetic.
            Button { withMotion(Motion.reveal) { howOpen.toggle() } } label: {
                HStack(spacing: 4) {
                    Text(model.t("results.docEffect.how")).sfFont(15, weight: .semibold)
                    Image(systemName: howOpen ? "chevron.up" : "chevron.down").sfFont(12, weight: .semibold)
                }
                .foregroundStyle(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            .accessibilityIdentifier("results.docEffect.how")
            if howOpen {
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.resultsBasisText(effect.annualization)).monoFont(13, weight: 400).foregroundStyle(theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("results.incomeBasis")
                    NoteText(text: model.t("results.incomeBasis.note"))
                    LinkText(label: model.t("results.incomeBasis.change"), size: 15, id: "results.incomeBasis.change") {
                        model.path.append(.question(QuickCheck.incomeStep, returnTo: .results))
                    }
                }
                .revealsIntoView()
                .transition(Motion.revealTransition)
            }
            Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5).padding(.vertical, 8)
            NoteText(text: model.t("results.whoDecided.paystub"))
                .accessibilityIdentifier("results.whoDecided")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("results.docEffect")
    }
}

extension DocumentEffectCard {
    /// "Without the paystub / With the paystub": may qualify, and with an amount.
    private var comparison: some View {
        let rows: [(key: String, without: Int, with: Int, id: String)] = [
            ("results.docEffect.rowMay", DocumentEffect.mayQualify(effect.without).count, DocumentEffect.mayQualify(effect.with).count, "may"),
            ("results.docEffect.rowAmount", DocumentEffect.withAmount(effect.without).count, DocumentEffect.withAmount(effect.with).count, "amount"),
        ]
        return Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 8) {
            GridRow {
                Color.clear.frame(height: 1).gridCellUnsizedAxes([.horizontal, .vertical])
                Text(model.t("results.docEffect.withoutLabel")).sfFont(13, weight: .semibold).foregroundStyle(theme.note)
                    .fixedSize(horizontal: false, vertical: true).accessibilityHidden(true)
                Text(model.t("results.docEffect.withLabel")).sfFont(13, weight: .semibold).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true).accessibilityHidden(true)
            }
            ForEach(rows, id: \.id) { row in
                GridRow(alignment: .firstTextBaseline) {
                    // A row is read once, as a sentence, from its first cell (a grid row's modifiers go to each cell).
                    Text(model.t(row.key)).sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel("\(model.t(row.key)): \(model.t("results.docEffect.withoutLabel")) \(model.number(Double(row.without))), \(model.t("results.docEffect.withLabel")) \(model.number(Double(row.with)))")
                        .accessibilityIdentifier("results.docEffect.row.\(row.id)")
                    Text(verbatim: model.number(Double(row.without)))
                        .font(Font(DesignFonts.uiFont(.display, weight: 900, size: 30))).foregroundStyle(theme.note)
                        .accessibilityHidden(true)
                    Text(verbatim: model.number(Double(row.with)))
                        .font(Font(DesignFonts.uiFont(.display, weight: 900, size: 30))).foregroundStyle(theme.ink)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(theme.raised))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("results.docEffect.compare")
    }

    /// "About $3,000 a year, plus up to $2,016": the estimates of the programs that may qualify, their ceilings
    /// apart. Nothing when no program that may qualify shows an estimate.
    @ViewBuilder private var total: some View {
        let t = effect.totals
        if t.estimated > 0 || t.upTo > 0 {
            VStack(alignment: .leading, spacing: 4) {
                Text(t.estimated == 0 ? model.t("results.docEffect.upToOnly", ["upTo": model.money(t.upTo)])
                     : t.upTo > 0 ? model.t("results.docEffect.totalUpTo", ["amount": model.money(t.estimated), "upTo": model.money(t.upTo)])
                     : model.t("results.docEffect.total", ["amount": model.money(t.estimated)]))
                    .font(Font(DesignFonts.uiFont(.display, weight: 900, size: 30)))
                    .foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                NoteText(text: model.t("results.docEffect.totalNote"))
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("results.docEffect.total")
        }
    }
}

extension AppModel {
    /// The review's line for how the yearly income was worked out ("$29,233 = …").
    func reviewBasisText(_ a: ValidationResult.Annualization) -> String {
        switch a.basis {
        case .ytd(let cents, let date, let num, let den, _):
            t("review.basis.ytd", ["ytd": money(Double(cents) / 100, cents: true), "date": documentDate(date), "months": months(num, den),
                                   "amount": money(Double(a.annualIncome))])
        case .average(let avg, let periods, _, _):
            t("review.basis.average", ["average": money(Double(avg) / 100, cents: true), "periods": String(periods),
                                       "amount": money(Double(a.annualIncome))])
        }
    }

    /// The results' sentence for the same arithmetic (results.incomeBasis.*).
    func resultsBasisText(_ a: ValidationResult.Annualization) -> String {
        switch a.basis {
        case .ytd(let cents, let date, let num, let den, _):
            t("results.incomeBasis.ytd", ["ytd": money(Double(cents) / 100, cents: true), "date": documentDate(date), "months": months(num, den),
                                          "amount": money(Double(a.annualIncome))])
        case .average(let avg, let periods, _, _):
            t("results.incomeBasis.average", ["average": money(Double(avg) / 100, cents: true), "periods": String(periods),
                                              "amount": money(Double(a.annualIncome))])
        }
    }

    private func months(_ num: Int, _ den: Int) -> String {
        CopyBook.formatAmount((Double(num) / Double(den) * 100).rounded() / 100, locale)
    }
}
