// The parts of a program's page below the result: "Why this result" (from the rules, always there;
// with a device model, an explanation of the person's own result written on this device), "About
// this program" and prepared questions (a model that only knows the silhouette), and a typed
// question (on this device only). Every answer shows where it was written and why.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct WhySection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            ScreenHeading(text: model.t("why.title"), style: .heading).accessibilityIdentifier("why.title")
            Text(model.t("why.lead")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
            ForEach(model.whyRows(programId)) { row in
                HStack(alignment: .firstTextBaseline, spacing: theme.space("sm")) {
                    StateIcon(state: row.state).alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 6 }
                    VStack(alignment: .leading, spacing: theme.space("xxs")) {
                        Text(row.label).tokenFont(.body).foregroundStyle(theme.text)
                        ForEach(Array(row.limits.enumerated()), id: \.offset) { _, l in
                            Text(model.t("why.limitYours", ["limit": l.limit, "value": l.yours])).tokenFont(.small).foregroundStyle(theme.text)
                        }
                        Text(model.t("state.\(row.state.rawValue)")).tokenFont(.small).foregroundStyle(theme.textMuted)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(theme.space("sm"))
                .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("why.\(row.id)")
            }
            if model.deviceModelAvailable {
                let key = model.personalKey(programId)
                if case .idle = model.state(key) {
                    Button(model.t("why.explain")) { model.explainPersonal(programId) }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("why.explain")
                }
                RequestView(key: key)
            } else {
                Text(model.t("why.unavailable")).tokenFont(.small).foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("why.unavailable")
            }
        }
    }
}

struct AboutSection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            ScreenHeading(text: model.t("about.title"), style: .heading)
            Text(model.t("about.lead")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
            if model.silhouetteForAnswers == nil {
                Text(model.t("results.empty")).tokenFont(.small)
            } else {
                let shortKey = model.aboutKey(programId, long: false)
                if again(model.state(shortKey)) {
                    Button(model.t("about.explain")) { model.startAbout(programId, long: false) }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("about.explain")
                }
                RequestView(key: shortKey)
                if case .done = model.state(shortKey) {
                    let longKey = model.aboutKey(programId, long: true)
                    if again(model.state(longKey)) {
                        Button(model.t("answers.explainLong")) { model.startAbout(programId, long: true) }.buttonStyle(.quietAction)
                    }
                    RequestView(key: longKey)
                }
                Text(model.t("ask.chips")).tokenFont(.bodyStrong).accessibilityAddTraits(.isHeader)
                ForEach(AppModel.chips, id: \.self) { chip in
                    let key = model.chipKey(programId, chip)
                    VStack(alignment: .leading, spacing: theme.space("xs")) {
                        Button(model.t("ask.chip.\(chip)")) { model.startChip(programId, chip) }
                            .buttonStyle(.secondaryAction)
                            .accessibilityIdentifier("chip.\(chip)")
                        RequestView(key: key)
                    }
                }
            }
        }
    }

    private func again(_ state: RequestState) -> Bool {
        switch state {
        case .idle, .skipped, .cancelled, .failed: true
        default: false
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
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            ScreenHeading(text: model.t("ask.free.label"), style: .heading)
            if !model.deviceModelAvailable {
                Text(model.t("ask.free.unavailable")).tokenFont(.small).foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("ask.free.unavailable")
            } else {
                Text(model.t("ask.free.help")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                TextField(model.t("ask.free.label"), text: $text, axis: .vertical)
                    .lineLimit(2...5)
                    .padding(theme.space("sm"))
                    .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                    .accessibilityIdentifier("ask.free.text")
                if empty { Text(model.t("ask.free.empty")).tokenFont(.small).foregroundStyle(theme.danger) }
                Button(model.t("ask.free.send")) {
                    let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !q.isEmpty else { empty = true; return }
                    empty = false
                    keys.append((model.askFree(programId, question: q), q))
                    text = ""
                }
                .buttonStyle(.secondaryAction)
                .accessibilityIdentifier("ask.free.send")
                ForEach(keys, id: \.key) { entry in
                    Text(entry.question).tokenFont(.bodyStrong)
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

    var body: some View {
        switch model.state(key) {
        case .idle:
            EmptyView()
        case .confirm(let request, let lines):
            SendPanel(request: request, lines: lines, onSend: { model.send(key) }, onKeep: { model.keepOnDevice(key) })
        case .loading(let slow):
            VStack(alignment: .leading, spacing: theme.space("xs")) {
                HStack(spacing: theme.space("sm")) {
                    ProgressView()
                    Text(model.t(slow ? "answers.slow" : "answers.loading")).tokenFont(.small)
                }
                .accessibilityElement(children: .combine)
                Button(model.t("answers.cancel")) { model.cancel(key) }.buttonStyle(.quietAction)
            }
            .accessibilityIdentifier("answer.loading")
        case .done(let result, let sentBefore):
            AnswerView(result: result, sentBefore: sentBefore)
        case .failed(let error):
            Text(model.t(error.copyKey)).tokenFont(.small).foregroundStyle(theme.text).fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("answer.error")
        case .skipped:
            Text(model.t("send.skipped")).tokenFont(.small).fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("send.skipped")
        case .cancelled:
            Text(model.t("answers.cancelled")).tokenFont(.small).fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct AnswerView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let result: TaskResult
    let sentBefore: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space("xs")) {
            ProvenanceBadge(source: result.source, reason: result.reason, route: result.route, noDeviceModel: result.noDeviceModel)
            if result.reason == .onDeviceFailed { Text(model.t("answers.retried")).tokenFont(.small) }
            if sentBefore { Text(model.t("send.once")).tokenFont(.small).foregroundStyle(theme.textMuted) }
            Text(result.text).tokenFont(.body).foregroundStyle(theme.text).fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("answer.text")
        }
        .padding(theme.space("sm"))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("answer")
    }
}

/// Where an answer was written, and why (routing.json reason, with the detail that decided it).
struct ProvenanceBadge: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
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
        HStack(spacing: theme.space("xs")) {
            Image(systemName: source == .inCloud ? "cloud" : source == .onDevice ? "iphone" : "doc.text").accessibilityHidden(true)
            Text("\(badge) · \(reasonText)").fixedSize(horizontal: false, vertical: true)
        }
        .tokenFont(.small)
        .foregroundStyle(theme.text)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(source == .onDevice ? model.t("badge.sentence.device", ["reason": reasonText])
            : source == .inCloud ? model.t("badge.sentence.cloud", ["reason": reasonText]) : "\(badge): \(reasonText).")
        .accessibilityIdentifier("answer.badge")
    }
}

/// The step before sending: the silhouette lines, the request as the app builds it, where it would
/// run, and Send or "Keep everything on this device".
struct SendPanel: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let request: CloudRequest
    let lines: [String]
    let onSend: () -> Void
    let onKeep: () -> Void
    @State private var showRequest = false

    var body: some View {
        let cloudFirst = AnswerSession.destination(of: request) == .cloud
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            Text(model.t("send.title")).tokenFont(.heading).accessibilityAddTraits(.isHeader)
            Text(model.t(cloudFirst ? "send.leadCloud" : "send.lead")).tokenFont(.small).fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: theme.space("xxs")) {
                Text(model.t("preview.couldLeave")).tokenFont(.small).foregroundStyle(theme.textMuted)
                ForEach(lines, id: \.self) { Text($0).tokenFont(.small).fixedSize(horizontal: false, vertical: true) }
                Text(model.t("send.notListed")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                Text(model.t("outbound.model", ["model": request.model])).tokenFont(.small)
            }
            .padding(theme.space("sm"))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.surfaceSunken, in: RoundedRectangle(cornerRadius: theme.radius("control")))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("send.lines")
            Text(model.t("send.notSent")).tokenFont(.small).fixedSize(horizontal: false, vertical: true)
            Text(model.t("leaving.network")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
            DisclosureGroup(isExpanded: $showRequest) {
                Text(model.t("send.requestAsBuilt")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                Text(request.rendering.text).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
                    .accessibilityIdentifier("send.request")
            } label: {
                Text(model.t("send.showRequest")).tokenFont(.small)
            }
            ProvenanceBadge(source: cloudFirst ? .inCloud : .onDevice, reason: request.reason, route: request.route)
            Button(model.t("send.send"), action: onSend).buttonStyle(.primaryAction).accessibilityIdentifier("send.send")
            Button(model.t("send.skip"), action: onKeep).buttonStyle(.secondaryAction).accessibilityIdentifier("send.skip")
        }
        .padding(theme.space("md"))
        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("panel")))
        .overlay(RoundedRectangle(cornerRadius: theme.radius("panel")).strokeBorder(theme.borderStrong, lineWidth: 2))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("send.panel")
    }
}
