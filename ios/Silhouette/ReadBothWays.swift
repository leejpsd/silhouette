// "Read both ways" (contract v1.44): on the judges' path the sample's silhouette is read on a device and in
// the cloud, one after the other; the review then shows the two answers side by side, value by value, above
// the values, and says which one is used (the device's). A recorded reading says where and when it was
// recorded; a live one says it was read now (on this iPhone, or in the cloud: contract v1.47), and a cloud
// reading that did not complete now says why the recording is shown instead. Never shown for a reading that
// did not happen.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

/// The two answers to the sample's silhouette and their comparison. Memory only.
struct BothWays {
    /// The device's answer was read now, on this iPhone (otherwise it is a recording).
    let deviceLive: Bool
    /// The iPhone a recorded device answer was made on, and when (ISO).
    let machine: String?
    let deviceDate: String?
    /// The cloud's answer was read now (contract v1.47); otherwise it is the recording.
    let cloudLive: Bool
    let cloudModel: String
    /// When the recorded cloud answer was recorded (ISO); nil for one read now.
    let cloudDate: String?
    /// Why the cloud did not answer now, when the recording is shown instead of a live answer.
    let fallback: CloudFallback?
    let comparison: BothWaysComparison
    /// The device's answer the comparison was made with (the review must still hold it).
    let devicePointers: String
}

struct ReadBothWaysCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let both: BothWays

    /// The fields shown as pairs: those that decide the yearly income, when both gave the same value.
    private static let shownFields = ["grossPay", "ytdGross", "payDate"]

    private var rows: [BothWaysComparison.Row] {
        Self.shownFields.compactMap { f in both.comparison.rows.first { $0.field == f && $0.same && $0.deviceRef != nil && $0.cloudRef != nil } }
    }

    var body: some View {
        Card {
            Text(model.t("review.both.title")).sfFont(20, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("review.both.title")
            // The two ways, side by side: who answered, and when it was recorded.
            HStack(alignment: .top, spacing: 12) {
                column(kind: .device,
                       label: model.t(both.deviceLive ? "review.both.deviceLive" : "review.both.device"),
                       note: both.deviceLive ? nil : model.t("review.both.recordedOn", ["machine": both.machine ?? "iPhone",
                                                                                            "date": both.deviceDate.map(model.recordedDay) ?? ""]),
                       id: "review.both.deviceColumn")
                column(kind: .cloud, label: model.t("review.both.cloud"),
                       note: both.cloudLive ? model.t("review.both.liveCloud", ["model": both.cloudModel])
                           : model.t("review.both.recordedCloud", ["model": both.cloudModel, "date": both.cloudDate.map(model.recordedDay) ?? ""]),
                       id: "review.both.cloudColumn")
            }
            .padding(.top, 12)
            // The live cloud reading did not complete: why, and that the recording is shown instead.
            if let fallback = both.fallback {
                Text(model.t("review.both.cloudFallback", ["reason": model.t(fallback.copyKey)]))
                    .sfFont(15).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                    .accessibilityIdentifier("review.both.cloudFallback")
            }
            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(rows) { row in pair(row) }
                }
                .padding(.top, 12)
            }
            Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5).padding(.vertical, 12)
            let c = both.comparison
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: c.differing.isEmpty ? "checkmark.circle.fill" : "equal.circle")
                    .sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                    .accessibilityHidden(true)
                Text(model.t("review.both.same", ["count": model.number(Double(c.sameCount)), "total": model.number(Double(c.total))]))
                    .sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("review.both.same")
            if !c.differing.isEmpty {
                Text(model.t("review.both.differs", ["fields": c.differing.map { model.t("field.paystub.\($0)") }.joined(separator: ", ")]))
                    .sfFont(15).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                    .accessibilityIdentifier("review.both.differs")
            }
            ForEach([("review.both.onlyCloud", c.onlyCloud), ("review.both.onlyDevice", c.onlyDevice)], id: \.0) { key, fields in
                if !fields.isEmpty {
                    Text(model.t(key, ["fields": fields.map { model.t("field.paystub.\($0)") }.joined(separator: ", ")]))
                        .sfFont(15).foregroundStyle(theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 6)
                        .accessibilityIdentifier(key)
                }
            }
            Text(model.t("review.both.uses")).sfFont(15).foregroundStyle(theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
                .accessibilityIdentifier("review.both.uses")
            NoteText(text: model.t(noteKey))
                .padding(.top, 6)
                .accessibilityIdentifier("review.both.note")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("review.both")
    }

    /// The note under the comparison: which answers were read now (contract v1.47).
    private var noteKey: String {
        switch (both.deviceLive, both.cloudLive) {
        case (true, true): "review.both.noteBothLive"
        case (false, true): "review.both.noteCloudLive"
        case (true, false): "review.both.noteLive"
        case (false, false): "review.both.note"
        }
    }

    private func column(kind: WhereRan, label: String, note: String?, id: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            WhereBadge(kind: kind, label: label)
            if let note {
                Text(note).sfFont(13).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(id)
    }

    /// "Gross pay this period": the device's placeholder and the value put back, the cloud's beside it.
    private func pair(_ row: BothWaysComparison.Row) -> some View {
        let label = model.t("field.paystub.\(row.field)")
        let device = value(row.deviceRef)
        let cloud = value(row.cloudRef)
        return VStack(alignment: .leading, spacing: 4) {
            Text(label).sfFont(12, weight: .semibold).foregroundStyle(theme.note)
            HStack(alignment: .center, spacing: 12) {
                side(row.deviceRef ?? "", device)
                side(row.cloudRef ?? "", cloud)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(model.t("review.both.device")) \(row.deviceRef ?? "") \(device), \(model.t("review.both.cloud")) \(row.cloudRef ?? "") \(cloud)")
        .accessibilityIdentifier("review.both.pair.\(row.field)")
    }

    private func side(_ ref: String, _ value: String) -> some View {
        HStack(spacing: 6) {
            TokenChip(id: ref, size: 12, compact: true)
            Image(systemName: "arrow.right").sfFont(10, weight: .bold).foregroundStyle(theme.note)
            Text(verbatim: value).monoFont(15, weight: 600).foregroundStyle(theme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The value a placeholder stands for, from this iPhone's own copy of the document.
    private func value(_ ref: String?) -> String {
        guard let ref, let silhouette = model.silhouette, let line = DocumentSession.line(of: silhouette, containing: ref) else { return "" }
        return line.lazy.compactMap { seg -> String? in
            if case .placeholder(let id, _, let original) = seg, id == ref { return original }
            return nil
        }.first ?? ""
    }
}
