// The pointer, with this reading's own answer (contracts v1.30, v1.41): the model answered one field with
// a placeholder id ("grossPay": "N12") and this iPhone put the value back (1,271.88). Under it the value's
// line twice: as the model saw it (the silhouette, placeholders as chips, the answered one marked) and the
// same line on this iPhone (the values, the one put back marked). Shown for a reading by a model (on this
// iPhone, in the cloud, or a recorded cloud reading), not for the sample's answer key or typed numbers.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct PointerCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    /// The field shown: gross pay, else the first number answered with a single placeholder.
    private var answered: (field: String, ref: String)? {
        guard let pointers = model.document.pointers else { return nil }
        let found = model.document.fieldsForDisplay.filter { $0.found && $0.kind == .number }
        func scalar(_ name: String) -> String? {
            guard let ref = pointers[name]?.stringValue, ref.hasPrefix("N") else { return nil }
            return ref
        }
        if let ref = scalar("grossPay"), found.contains(where: { $0.name == "grossPay" }) { return ("grossPay", ref) }
        for f in found { if let ref = scalar(f.name) { return (f.name, ref) } }
        return nil
    }

    var body: some View {
        if let extraction = model.document.extraction, [.onDevice, .inCloud, .recordedCloud, .recordedDevice].contains(extraction.source),
           let answered, let silhouette = model.silhouette,
           let line = DocumentSession.line(of: silhouette, containing: answered.ref) {
            let value = line.compactMap { seg -> String? in
                if case .placeholder(let id, _, let original) = seg, id == answered.ref { return original }
                return nil
            }.first ?? ""
            card(source: extraction.source, field: answered.field, ref: answered.ref, value: value, line: line)
        }
    }

    private func card(source: InferenceSource, field: String, ref: String, value: String, line: [PreviewSegment]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .bottom, spacing: 10) { said(field, ref); arrow; put(value) }
                VStack(alignment: .leading, spacing: 8) { said(field, ref); put(value) }
            }
            VStack(alignment: .leading, spacing: 6) {
                label(model.t("review.pointer.modelLine"))
                lineView(line, ref: ref, model: true).accessibilityIdentifier("pointer.modelLine")
                label(model.t("review.pointer.deviceLine")).padding(.top, 4)
                lineView(line, ref: ref, model: false).accessibilityIdentifier("pointer.deviceLine")
            }
            NoteText(text: caption(source, ref: ref, value: value))
                .accessibilityIdentifier("pointer.caption")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(theme.cardBorder, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("pointer.card")
    }

    private func caption(_ source: InferenceSource, ref: String, value: String) -> String {
        switch source {
        case .recordedCloud:
            model.t("review.pointer.recordedCloud", ["date": model.document.recordedDate.map(model.recordedDay) ?? "", "ref": ref, "value": value])
        case .recordedDevice:
            model.t("review.pointer.recorded", ["machine": model.deviceRecordings.first { $0.date == model.document.recordedDate }.map(model.machineName) ?? "iPhone",
                                                "ref": ref, "value": value])
        case .inCloud: model.t("review.pointer.cloud", ["ref": ref, "value": value])
        default: model.t("review.pointer.device", ["ref": ref, "value": value])
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).sfFont(12, weight: .semibold).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
    }


    private func said(_ field: String, _ ref: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            label(model.t("review.pointer.said"))
            HStack(spacing: 0) {
                Text(verbatim: "\"\(field)\": \"").monoFont(15, weight: 500).foregroundStyle(theme.ink)
                TokenChip(id: ref, size: 15, compact: true)
                Text(verbatim: "\"").monoFont(15, weight: 500).foregroundStyle(theme.ink)
            }
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(field): \(ref)")
            .accessibilityIdentifier("pointer.answer")
        }
    }

    private var arrow: some View {
        Image(systemName: "arrow.right").sfFont(15, weight: .semibold).foregroundStyle(theme.icon)
            .padding(.bottom, 4)
            .accessibilityHidden(true)
    }

    private func put(_ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            label(model.t("review.pointer.put"))
            Text(verbatim: value).monoFont(20, weight: 600).foregroundStyle(theme.ink)
                .fixedSize()
                .accessibilityIdentifier("pointer.value")
        }
    }

    /// Runs of four or more spaces (columns) shortened alike in both lines, so they stay comparable.
    private static func squeeze(_ text: String) -> String {
        text.replacingOccurrences(of: " {4,}", with: "   ", options: .regularExpression)
    }

    /// The line in Plex Mono, on one line (it scrolls sideways when wider than the card).
    private func lineView(_ segments: [PreviewSegment], ref: String, model asModel: Bool) -> some View {
        let parts = trimmed(segments)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, seg in
                    switch seg {
                    case .text(let t), .word(let t):
                        Text(verbatim: Self.squeeze(t)).monoFont(13, weight: 400).foregroundStyle(theme.ink).fixedSize()
                    case .placeholder(let id, _, let original):
                        if asModel {
                            if id == ref { TokenChip(id: id, size: 13, compact: true) } else {
                                Text(verbatim: id).monoFont(13, weight: 500).foregroundStyle(theme.note)
                                    .padding(.horizontal, 3)
                                    .background(RoundedRectangle(cornerRadius: 6).strokeBorder(theme.note.opacity(0.5), lineWidth: 1))
                                    .fixedSize()
                            }
                        } else if id == ref {
                            Text(verbatim: original ?? "").monoFont(13, weight: 600).foregroundStyle(theme.onInk)
                                .padding(.horizontal, 4)
                                .background(RoundedRectangle(cornerRadius: 4).fill(theme.ink))
                                .fixedSize()
                        } else {
                            Text(verbatim: original ?? "").monoFont(13, weight: 400).foregroundStyle(theme.ink).fixedSize()
                        }
                    }
                }
            }
            .padding(10)
        }
        .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(parts.map { seg -> String in
            switch seg {
            case .text(let t), .word(let t): t
            case .placeholder(let id, _, let original): asModel ? id : (original ?? "")
            }
        }.joined())
    }

    /// The line without its leading and trailing spaces.
    private func trimmed(_ segments: [PreviewSegment]) -> [PreviewSegment] {
        var out = segments
        if case .text(let t)? = out.first { out[0] = .text(String(t.drop { $0 == " " })) }
        if case .text(let t)? = out.last { out[out.count - 1] = .text(String(t.reversed().drop { $0 == " " }.reversed())) }
        return out
    }
}
