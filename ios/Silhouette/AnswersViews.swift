// The parts of a program's page below the result: "Why this result" (from the rules, always there;
// with a device model, an explanation of the person's own result written on this device), "About
// this program" and prepared questions (a model that only knows the silhouette), and a typed
// question (on this device only). Every answer shows where it was written and why. The step before
// sending is a sheet.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct WhySection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeading(text: model.t("why.title")).accessibilityIdentifier("why.title")
            Para(model.t("why.lead"), .small)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(model.whyRows(programId)) { row in
                    Rectangle().fill(theme.line).frame(height: 1)
                    WhyRowView(row: row)
                }
            }
            if model.deviceModelAvailable {
                let key = model.personalKey(programId)
                if case .idle = model.state(key) {
                    Button(model.t("why.explain")) { model.explainPersonal(programId) }
                        .buttonStyle(OutlineStyle(fullWidth: true))
                        .accessibilityIdentifier("why.explain")
                }
                RequestView(key: key)
            } else {
                DashedNote { Text(model.t("why.unavailable")) }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("why.unavailable")
                    .padding(.top, 8)
            }
        }
    }
}

private struct WhyRowView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let row: WhyRow

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(row.label).type(.label).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
            if row.limits.isEmpty {
                HStack {
                    Text(model.t("state.\(row.state.rawValue)")).type(.small).foregroundStyle(theme.inkMuted)
                    Spacer()
                    StateIcon(state: row.state)
                }
            } else {
                ForEach(Array(row.limits.enumerated()), id: \.offset) { _, l in
                    LimitLine(label: model.t("detail.limit"), value: l.limit)
                    LimitLine(label: model.t("detail.you"), value: l.yours, state: row.state)
                }
                if row.state != .pass && row.state != .fail {
                    Text(model.t("state.\(row.state.rawValue)")).type(.small).foregroundStyle(theme.inkMuted)
                }
            }
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(([row.label] + row.limits.map { model.t("why.limitYours", ["limit": $0.limit, "value": $0.yours]) }
                             + [model.t("state.\(row.state.rawValue)")]).joined(separator: ". "))
        .accessibilityIdentifier("why.\(row.id)")
    }
}

struct AboutSection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(text: model.t("about.title"))
            Para(model.t("about.lead"), .small)
            if model.silhouetteForAnswers == nil {
                Para(model.t("results.empty"), .small)
            } else {
                let shortKey = model.aboutKey(programId, long: false)
                if again(model.state(shortKey)) {
                    Button(model.t("about.explain")) { model.startAbout(programId, long: false) }
                        .buttonStyle(OutlineStyle(fullWidth: true))
                        .accessibilityIdentifier("about.explain")
                }
                RequestView(key: shortKey) { model.startAbout(programId, long: false) }
                if case .done = model.state(shortKey) {
                    let longKey = model.aboutKey(programId, long: true)
                    if again(model.state(longKey)) {
                        Button(model.t("answers.explainLong")) { model.startAbout(programId, long: true) }
                            .buttonStyle(TextLinkStyle())
                            .accessibilityIdentifier("about.long")
                    }
                    RequestView(key: longKey) { model.startAbout(programId, long: true) }
                }
                Text(model.t("ask.chips")).type(.label).foregroundStyle(theme.ink).accessibilityAddTraits(.isHeader)
                    .padding(.top, 4)
                FlowLayout {
                    ForEach(AppModel.chips, id: \.self) { chip in
                        Button(model.t("ask.chip.\(chip)")) { model.startChip(programId, chip) }
                            .buttonStyle(ChipStyle(selected: asked(model.state(model.chipKey(programId, chip)))))
                            .accessibilityIdentifier("chip.\(chip)")
                    }
                }
                ForEach(AppModel.chips, id: \.self) { chip in
                    let key = model.chipKey(programId, chip)
                    if shows(model.state(key)) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(model.t("ask.chip.\(chip)")).type(.bodyStrong).foregroundStyle(theme.ink)
                            RequestView(key: key) { model.startChip(programId, chip) }
                        }
                    }
                }
            }
        }
    }

    private func again(_ state: RequestState) -> Bool {
        switch state {
        case .idle, .skipped, .cancelled: true
        case .failed(let e): e.kind == .quotaDaily || e.kind == .blocked
        default: false
        }
    }

    private func asked(_ state: RequestState) -> Bool {
        if case .done = state { true } else { false }
    }

    private func shows(_ state: RequestState) -> Bool {
        switch state {
        case .idle, .confirm: false
        default: true
        }
    }
}

struct FreeTextSection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String
    @State private var text = ""
    @State private var empty = false
    @State private var keys: [(key: String, question: String)] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(text: model.t("ask.free.label"))
            if !model.deviceModelAvailable {
                DashedNote { Text(model.t("ask.free.unavailable")) }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("ask.free.unavailable")
            } else {
                Para(model.t("ask.free.help"), .small)
                TextField("", text: $text, axis: .vertical)
                    .lineLimit(2...5)
                    .fieldStyle(error: empty, mono: false)
                    .accessibilityLabel(model.t("ask.free.label"))
                    .accessibilityIdentifier("ask.free.text")
                if empty {
                    Label(model.t("ask.free.empty"), systemImage: "exclamationmark.triangle").type(.label).foregroundStyle(theme.ink)
                }
                Button(model.t("ask.free.send")) {
                    let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !q.isEmpty else { empty = true; return }
                    empty = false
                    keys.append((model.askFree(programId, question: q), q))
                    text = ""
                }
                .buttonStyle(OutlineStyle(fullWidth: true))
                .accessibilityIdentifier("ask.free.send")
                ForEach(keys, id: \.key) { entry in
                    Text(entry.question).type(.bodyStrong).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    RequestView(key: entry.key)
                }
            }
        }
    }
}

// MARK: - A request and its answer

struct RequestView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let key: String
    /// Starts the same request again after an error.
    var retry: (() -> Void)? = nil
    @State private var showDetail = false

    var body: some View {
        switch model.state(key) {
        case .idle, .confirm:
            EmptyView()
        case .loading(let slow):
            VStack(alignment: .leading, spacing: 4) {
                LoadingLines(text: model.t(slow ? "answers.slow" : "answers.loading"))
                Button(model.t("answers.cancel")) { model.cancel(key) }
                    .buttonStyle(TextLinkStyle())
                    .accessibilityIdentifier("answer.cancel")
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("answer.loading")
        case .done(let result, let sentBefore):
            AnswerView(result: result, sentBefore: sentBefore)
        case .failed(let error):
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle").accessibilityHidden(true)
                    Text(model.t(error.copyKey)).fixedSize(horizontal: false, vertical: true)
                }
                .type(.label, size: 13.5)
                .foregroundStyle(theme.ink)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("answer.error")
                if let retry, error.kind != .quotaDaily, error.kind != .blocked {
                    Button { retry() } label: { Label(model.t("answers.retry"), systemImage: "arrow.clockwise") }
                        .buttonStyle(OutlineStyle(fullWidth: true))
                        .accessibilityIdentifier("answer.retry")
                }
                if let status = error.status {
                    Disclosure(label: model.t("error.detail"), open: $showDetail) {
                        Text(verbatim: "\(error.kind.rawValue) \(status)").type(.monoValue).foregroundStyle(theme.ink)
                    }
                }
            }
        case .skipped:
            Para(model.t("send.skipped"), .small)
                .accessibilityIdentifier("send.skipped")
        case .cancelled:
            Para(model.t("answers.cancelled"), .small)
                .accessibilityIdentifier("answer.cancelled")
        }
    }
}

struct AnswerView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let result: TaskResult
    let sentBefore: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(model.t("answers.ready")).type(.label).foregroundStyle(theme.ink)
            ProvenanceBadge(source: result.source, reason: result.reason, route: result.route, noDeviceModel: result.noDeviceModel)
            if result.reason == .onDeviceFailed { Para(model.t("answers.retried"), .small) }
            if sentBefore { Para(model.t("send.once"), .small, muted: true) }
            Text(result.text)
                .type(.body)
                .foregroundStyle(theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("answer.text")
        }
        .appear(.rise)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("answer")
    }
}

/// Where an answer was written, and why: an 18 pt icon, the label in bold, " · ", the routing reason
/// (with the detail that decided it), 13.5 pt. Text and an icon only, never a pill.
struct ProvenanceBadge: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let source: InferenceSource
    let reason: RoutingReason
    var route: ExplainRoute? = nil
    var noDeviceModel = false

    private var detail: String? {
        if noDeviceModel { return model.t("reason.detail.noDeviceModel") }
        guard let route, reason != .onDeviceFailed else { return nil }
        return route.basis == .locale
            ? model.t("reason.detail.locale", ["language": route.locale.nativeName])
            : model.t("reason.detail.words", ["words": String(route.words), "limit": String(route.maxShortWords)])
    }

    var body: some View {
        let reasonText = model.t(reason.copyKey) + (detail.map { " (\($0))" } ?? "")
        let badge = switch source {
        case .onDevice: model.t("badge.onDevice")
        case .inCloud: model.t("badge.cloud")
        case .sampleAnswerKey: model.t("badge.sampleKey")
        }
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: source == .inCloud ? "cloud" : source == .onDevice ? "iphone" : "doc.text")
                .font(.system(size: 14, weight: .semibold))
                .frame(width: 18)
                .accessibilityHidden(true)
            Text("\(Text(badge).bold()) · \(reasonText)").fixedSize(horizontal: false, vertical: true)
        }
        .type(.small)
        .foregroundStyle(theme.ink(on: surface))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(source == .onDevice ? model.t("badge.sentence.device", ["reason": reasonText])
            : source == .inCloud ? model.t("badge.sentence.cloud", ["reason": reasonText]) : "\(badge): \(reasonText).")
        .accessibilityIdentifier(source == .sampleAnswerKey ? "source.badge" : "answer.badge")
    }
}

// MARK: - The step before sending (a sheet)

/// What could leave, on paper under a pink tab; what is not sent; the request as the app builds it.
struct SendSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let key: String
    @State private var showRequest = false

    var body: some View {
        if case .confirm(let request, let lines) = model.state(key) {
            let cloudFirst = AnswerSession.destination(of: request) == .cloud
            Para(model.t(cloudFirst ? "send.leadCloud" : "send.lead"))
            VStack(alignment: .leading, spacing: 0) {
                LeaveTab(text: model.t("preview.couldLeave"))
                    .padding(.leading, 10)
                    .zIndex(1)
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(lines, id: \.self) { Text($0).type(.monoValue).fixedSize(horizontal: false, vertical: true) }
                    Text(model.t("send.notListed")).type(.caption).foregroundStyle(theme.onPaperMuted)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    Text(model.t("outbound.model", ["model": request.model])).type(.monoValue)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .paper(tilt: theme.rotation("paperSmall"))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("send.lines")
            }
            Para(model.t("send.notSent"), .small)
            Para(model.t("leaving.network"), .small)
            Disclosure(label: model.t("send.showRequest"), open: $showRequest, id: "send.showRequest") {
                Para(model.t("send.requestAsBuilt"), .small)
                Text(request.rendering.text)
                    .type(.monoValue)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .paper(size: .small)
                    .accessibilityIdentifier("send.request")
            }
        }
    }
}

/// The decision at the foot of the sheet: the routing line, Keep everything on this device, Send.
struct SendFooter: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let key: String
    let request: CloudRequest

    var body: some View {
        let cloudFirst = AnswerSession.destination(of: request) == .cloud
        SheetFooter {
            ProvenanceBadge(source: cloudFirst ? .inCloud : .onDevice, reason: request.reason, route: request.route)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
            HStack(spacing: 10) {
                Button(model.t("send.skip")) { model.keepOnDevice(key) }
                    .buttonStyle(OutlineStyle(large: true, fullWidth: true))
                    .accessibilityIdentifier("send.skip")
                SendButton(label: model.t("send.send"), id: "send.send") { model.send(key) }
            }
        }
    }
}

/// The pink "What could leave" tab over a paper card.
struct LeaveTab: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        Text(text)
            .type(.label)
            .foregroundStyle(theme.onLeave)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(RoundedRectangle(cornerRadius: 3).fill(theme.leave))
            .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(theme.leaveFocus, lineWidth: theme.border))
            .rotationEffect(theme.rotation("highlight"))
            .offset(y: 8)
            .accessibilityAddTraits(.isHeader)
    }
}
