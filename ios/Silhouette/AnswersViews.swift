// The parts of a program's page below the hero, and the answer screen: "Why this result"
// (from the rules, always there; with a device model, an explanation of the person's own result written
// on this device), prepared questions (a model given public information only) and a typed question
// (on this device only). Every answer shows where it was written and why. The step before sending is
// a sheet.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

/// "Why this result": each criterion with its state, limits with the person's value, the income bar.
struct WhySection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Card {
                HStack(alignment: .firstTextBaseline) {
                    Text(model.t("why.title")).font(.system(size: 20, weight: .semibold)).foregroundStyle(theme.ink)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("why.title")
                    Spacer(minLength: 8)
                    Text(model.t("badge.rulesOnly")).font(.system(size: 13, weight: .semibold)).foregroundStyle(theme.note)
                }
                NoteText(text: model.t("why.lead")).padding(.top, 4)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(model.whyRows(programId).enumerated()), id: \.element.id) { i, row in
                        if i > 0 { Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5) }
                        WhyRowView(row: row)
                    }
                }
                .padding(.top, 6)
            }
            if model.deviceModelAvailable {
                let key = model.personalKey(programId)
                if case .idle = model.state(key) {
                    SecondaryButton(label: model.t("why.explain"), id: "why.explain") { model.explainPersonal(programId) }
                }
                RequestView(key: key)
            } else {
                NoteText(text: model.t("why.unavailable"))
                    .accessibilityIdentifier("why.unavailable")
            }
        }
    }
}

private struct WhyRowView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let row: WhyRow

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(row.label).font(.system(size: 15, weight: .semibold)).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let l = row.limits.first {
                    Text("\(Text(l.yours).foregroundStyle(theme.ink)) / \(Text(l.limit).foregroundStyle(theme.note))")
                        .font(Font(DesignFonts.uiFont(.mono, weight: 500, size: 14)))
                        .multilineTextAlignment(.trailing)
                } else {
                    StateMark(state: row.state)
                }
            }
            if let i = row.limitVariables.firstIndex(of: "annualIncome"), let yours = AppModel.amount(row.limits[i].yours),
               let limit = AppModel.amount(row.limits[i].limit), limit > 0 {
                LimitBar(ratio: min(1, yours / limit))
            }
            ForEach(Array(row.limits.dropFirst().enumerated()), id: \.offset) { _, l in
                Text(model.t("why.limitYours", ["limit": l.limit, "value": l.yours]))
                    .font(Font(DesignFonts.uiFont(.mono, weight: 500, size: 13))).foregroundStyle(theme.ink)
            }
            if row.state != .pass && row.state != .fail || row.limits.isEmpty {
                Text(row.stateText).font(.system(size: 13)).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(row.notes, id: \.self) { note in
                Text(note).font(.system(size: 12)).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(([row.label] + row.limits.map { model.t("why.limitYours", ["limit": $0.limit, "value": $0.yours]) }
                             + [row.stateText] + row.notes).joined(separator: ". "))
        .accessibilityIdentifier("why.\(row.id)")
    }
}

/// A criterion's state: an ink check disc (met), an empty ring (not met), a half disc (depends on the
/// exact value), a dashed ring (unknown).
struct StateMark: View {
    @Environment(\.theme) private var theme
    let state: CriterionState

    var body: some View {
        Group {
            switch state {
            case .pass:
                Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(theme.color("onPrimary"))
                    .frame(width: 22, height: 22).background(Circle().fill(theme.ink))
            case .fail:
                Image(systemName: "xmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(theme.ink)
                    .frame(width: 22, height: 22).overlay(Circle().strokeBorder(theme.ink, lineWidth: 1.5))
            case .mixed: VerdictMarker(verdict: .maybe, size: 22)
            default: VerdictMarker(verdict: .depends, size: 22)
            }
        }
        .accessibilityHidden(true)
    }
}

/// Prepared questions: chips that open the step before sending, then the answer screen; requests
/// already made are listed with their state.
struct AskSection: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: model.t("ask.title"))
            NoteText(text: model.t("about.leadPublic"))
            ChipsFlow(programId: programId)
            // Requests that were kept on the device or did not complete stay listed here.
            ForEach(keys, id: \.self) { key in
                if case .skipped = model.state(key) { RequestView(key: key) }
                if case .failed = model.state(key) { RequestView(key: key) { model.answerContext[key].map { _ in restart(key) } } }
                if case .cancelled = model.state(key) { RequestView(key: key) }
                if case .done = model.state(key) {
                    Button { model.openAnswer(key) } label: {
                        ListRow(title: model.answerContext[key]?.question ?? model.t("answers.ready"), subtitle: model.t("answers.ready"),
                                titleWeight: .semibold) { IconTile(systemImage: "text.bubble") }
                            .background(RoundedRectangle(cornerRadius: 20).fill(theme.sheet))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var keys: [String] {
        [model.aboutKey(programId, long: false), model.aboutKey(programId, long: true)] + AppModel.chips.map { model.chipKey(programId, $0) }
    }

    private func restart(_ key: String) {
        if key == model.aboutKey(programId, long: false) { model.startAbout(programId, long: false) }
        else if key == model.aboutKey(programId, long: true) { model.startAbout(programId, long: true) }
        else if let chip = AppModel.chips.first(where: { model.chipKey(programId, $0) == key }) { model.startChip(programId, chip) }
    }
}

/// The prepared questions as chips (44 pt capsules, white with an 8 % border).
struct ChipsFlow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String
    var except: String? = nil

    var body: some View {
        FlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(AppModel.chips.filter { model.chipKey(programId, $0) != except }, id: \.self) { chip in
                Button { model.startChip(programId, chip) } label: {
                    Text(model.t("ask.chip.\(chip)")).font(.system(size: 15, weight: .medium)).foregroundStyle(theme.ink)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(theme.sheet))
                        .overlay(Capsule().strokeBorder(theme.cardBorder, lineWidth: 1))
                }
                .buttonStyle(PressScale())
                .accessibilityIdentifier("chip.\(chip)")
            }
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
            SectionLabel(text: model.t("ask.free.label"))
            if !model.deviceModelAvailable {
                NoteText(text: model.t("ask.free.unavailable"))
                    .accessibilityIdentifier("ask.free.unavailable")
            } else {
                NoteText(text: model.t("ask.free.help"))
                TextField("", text: $text, axis: .vertical)
                    .lineLimit(2...5)
                    .font(.system(size: 17))
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 12).fill(theme.sheet))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(empty ? theme.ink : theme.cardBorder, lineWidth: empty ? 1.5 : 1))
                    .accessibilityLabel(model.t("ask.free.label"))
                    .accessibilityIdentifier("ask.free.text")
                if empty { NoticeCard(text: model.t("ask.free.empty")) }
                PrimaryButton(label: model.t("ask.free.send"), id: "ask.free.send") {
                    let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !q.isEmpty else { empty = true; return }
                    empty = false
                    keys.append((model.askFree(programId, question: q), q))
                    text = ""
                }
                ForEach(keys, id: \.key) { entry in
                    QuestionBubble(text: entry.question)
                    RequestView(key: entry.key)
                }
            }
        }
    }
}

// MARK: - The answer screen

struct AnswerScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let key: String

    var body: some View {
        let context = model.answerContext[key]
        GroundScroll {
            VStack(alignment: .leading, spacing: 16) {
                if let context {
                    VStack(alignment: .trailing, spacing: 6) {
                        QuestionBubble(text: context.question)
                        if case .done(let result, _) = model.state(key) {
                            HStack(spacing: 6) {
                                if result.source == .inCloud { Circle().fill(theme.redact).frame(width: 6, height: 6) }
                                Text(model.t(result.source == .inCloud ? "answer.sentWith" : "answer.keptWith",
                                             ["program": model.programName(context.program), "time": model.time(Date())]))
                                    .font(.system(size: 12)).foregroundStyle(theme.note)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
                RequestView(key: key) { context.map { c in
                    if let chip = AppModel.chips.first(where: { model.chipKey(c.program, $0) == key }) { model.startChip(c.program, chip) }
                    else { model.startAbout(c.program, long: key == model.aboutKey(c.program, long: true)) }
                } }
                if let context {
                    SectionLabel(text: model.t("ask.next"), large: false).padding(.top, 8)
                    ChipsFlow(programId: context.program, except: key)
                }
            }
            .gutter()
            .padding(.top, 8)
        }
        .navigationTitle(context.map { model.programName($0.program) } ?? "")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The question as a bubble: ink, right-aligned.
struct QuestionBubble: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(theme.color("onPrimary"))
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 20).fill(theme.color("primary")))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 48)
    }
}

// MARK: - A request and its answer

struct RequestView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let key: String
    /// Starts the same request again after an error.
    var retry: (() -> Void)? = nil

    var body: some View {
        switch model.state(key) {
        case .idle, .confirm:
            EmptyView()
        case .loading(let slow):
            Card {
                SpinnerLine(text: model.t(slow ? "answers.slow" : "answers.loading"))
                LinkText(label: model.t("answers.cancel"), id: "answer.cancel") { model.cancel(key) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("answer.loading")
        case .done(let result, let sentBefore):
            AnswerView(result: result, sentBefore: sentBefore)
        case .failed(let error):
            NoticeCard(text: model.t(error.kind == .quotaDaily ? "error.quotaDailyAnswers" : error.copyKey)) {
                if let retry, error.kind != .quotaDaily, error.kind != .blocked {
                    SecondaryButton(label: model.t("answers.retry"), id: "answer.retry") { retry() }
                }
                if let status = error.status {
                    Text(verbatim: "\(error.kind.rawValue) \(status)").font(Font(DesignFonts.uiFont(.mono, weight: 400, size: 12))).foregroundStyle(theme.note)
                }
            }
            .accessibilityIdentifier("answer.error")
        case .skipped:
            NoteText(text: model.t("send.skipped"), size: 15)
                .accessibilityIdentifier("send.skipped")
        case .cancelled:
            NoteText(text: model.t("answers.cancelled"), size: 15)
                .accessibilityIdentifier("answer.cancelled")
        }
    }
}

/// The answer card: where it was written and why, the text, and that it never says whether the person
/// qualifies.
struct AnswerView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let result: TaskResult
    let sentBefore: Bool

    var body: some View {
        Card {
            ProvenanceBadge(source: result.source, reason: result.reason, route: result.route, noDeviceModel: result.noDeviceModel)
            if result.reason == .onDeviceFailed { NoteText(text: model.t("answers.retried")).padding(.top, 6) }
            if sentBefore { NoteText(text: model.t("send.linePublic")).padding(.top, 6) }
            Text(result.text)
                .font(.system(size: 17))
                .foregroundStyle(theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 12)
                .accessibilityIdentifier("answer.text")
            Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5).padding(.vertical, 12)
            NoteText(text: model.t("about.leadPublic"), size: 12)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("answer")
    }
}

/// Where an answer was written, and why: the badge ("On this device", "Cloud", sample answers) and the
/// routing reason with the detail that decided it, in note 13.
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
        VStack(alignment: .leading, spacing: 4) {
            WhereBadge(kind: source == .onDevice ? .device : source == .inCloud ? .cloud : .noModel, label: badge)
            Text(reasonText).font(.system(size: 13)).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(source == .onDevice ? model.t("badge.sentence.device", ["reason": reasonText])
            : source == .inCloud ? model.t("badge.sentence.cloud", ["reason": reasonText]) : "\(badge): \(reasonText).")
        .accessibilityIdentifier(source == .sampleAnswerKey ? "source.badge" : "answer.badge")
    }
}

// MARK: - The step before sending (a sheet)

/// "Before this leaves": what goes to the cloud (the exact lines), what stays on this device (masked
/// bars, never values), and the request as the app builds it on demand.
struct SendSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let key: String
    @State private var showRequest = false

    var body: some View {
        if case .confirm(let request, let lines) = model.state(key) {
            let cloudFirst = AnswerSession.destination(of: request) == .cloud
            NoteText(text: model.t(cloudFirst ? "send.leadCloud" : "send.lead"), size: 15)
            Card {
                Label {
                    Text(model.t("send.goesCloud")).font(.system(size: 15, weight: .semibold))
                } icon: {
                    Circle().fill(theme.redact).frame(width: 8, height: 8)
                }
                .foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(lines, id: \.self) { line in SendLine(line: line) }
                    SendLine(line: model.t("outbound.model", ["model": request.model]))
                }
                .padding(.top, 12)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("send.lines")
                DashedRule().stroke(theme.line, style: StrokeStyle(lineWidth: 1, dash: [3, 3])).frame(height: 1).padding(.vertical, 14)
                Label {
                    Text(model.t("send.staysHere")).font(.system(size: 15, weight: .semibold))
                } icon: {
                    Circle().fill(theme.ink).frame(width: 8, height: 8)
                }
                .foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 10) {
                    ForEach([("send.stays.income", 96.0), ("send.stays.household", 64.0), ("send.stays.answers", 120.0)], id: \.0) { item in
                        HStack(spacing: 12) {
                            Text(model.t(item.0)).font(.system(size: 15)).foregroundStyle(theme.note).frame(width: 110, alignment: .leading)
                            MaskBar(width: item.1)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(model.t(item.0))
                    }
                }
                .padding(.top, 12)
                NoteText(text: model.t("send.notSent")).padding(.top, 12)
            }
            Button { showRequest.toggle() } label: {
                HStack(spacing: 4) {
                    Text(model.t("send.showRequest")).font(.system(size: 15, weight: .semibold))
                    Image(systemName: showRequest ? "chevron.up" : "chevron.right").font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("send.showRequest")
            if showRequest {
                NoteText(text: model.t("send.requestAsBuilt"))
                MonoBlock(text: request.rendering.text, id: "send.request")
            }
            NoteText(text: model.t("leaving.network"))
        }
    }
}

/// One line that would leave: "Program: CalFresh" as a label and a value.
private struct SendLine: View {
    @Environment(\.theme) private var theme
    let line: String

    var body: some View {
        if let range = line.range(of: ": ") {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(line[..<range.lowerBound]).font(.system(size: 15)).foregroundStyle(theme.note).frame(width: 90, alignment: .leading)
                Text(line[range.upperBound...]).font(.system(size: 15, weight: .semibold)).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            Text(line).font(.system(size: 15)).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The decision at the foot of the sheet: where it would run, Send n lines (redact), Keep on device.
struct SendFooter: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let key: String
    let request: CloudRequest
    let lines: [String]

    var body: some View {
        let cloudFirst = AnswerSession.destination(of: request) == .cloud
        let count = lines.filter { $0.contains(": ") }.count
        SheetFooter {
            ProvenanceBadge(source: cloudFirst ? .inCloud : .onDevice, reason: request.reason, route: request.route)
                .frame(maxWidth: .infinity, alignment: .leading)
            PrimaryButton(label: count > 1 ? model.t("send.sendLines", ["count": model.number(Double(count))]) : model.t("send.send"),
                          sends: true, id: "send.send") { model.send(key) }
            SecondaryButton(label: model.t("send.keepShort"), id: "send.skip") { model.keepOnDevice(key) }
        }
    }
}

/// A horizontal line for a dashed rule.
struct DashedRule: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}
