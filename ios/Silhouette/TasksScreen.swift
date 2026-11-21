// Where each task runs: the routing table (shared/routing.json) as four cards: on this
// device only, this device first and the cloud if needed, in the cloud, and no model. Each card names
// its tasks joined by " · " and one note. Reached from the judges' page and the draft-rules sheet.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct TasksScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    enum Group: CaseIterable { case device, first, cloud, none }

    var body: some View {
        GroundScroll {
            Text(model.t("tasks.title"))
                .sfFont(34, weight: .bold)
                .foregroundStyle(theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("tasks.title")
                .gutter()
            NoteText(text: model.t("tasks.lead"), size: 15).gutter()
            ForEach(Group.allCases, id: \.self) { group in
                let tasks = tasks(in: group)
                if !tasks.isEmpty { card(group, tasks: tasks).gutter() }
            }
            NoteText(text: model.t("tasks.foot")).gutter()
            // Who picks device or cloud: the SDK's hybrid model, and the app's own steps around it. (The
            // shared tasks.appRoutes.ios said the app routes itself because the hybrid needs iOS 27; the SDK's
            // HybridModel runs on iOS 26, and the app now uses it.)
            Card(radius: 20) {
                Text(model.t("tasks.sdkRoutes")).sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("tasks.appRoutes")
            .gutter()
            measured.gutter()
            enforce.gutter()
            config.gutter()
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    /// The tasks of a group, in the table's order, by their names in the copy.
    private func tasks(in group: Group) -> [(name: String, tool: Bool)] {
        (model.bundle.routing?["tasks"]?.objectValue?.entries ?? []).compactMap { id, spec in
            let mode = spec["mode"]?.stringValue ?? ""
            let g: Group = switch mode {
            case "ONLY_ON_DEVICE": .device
            case "PREFER_ON_DEVICE": .first
            case "PREFER_IN_CLOUD", "ONLY_IN_CLOUD": .cloud
            default: .none
            }
            guard g == group, model.bundle.copy.has("tasks.task.\(id)") else { return nil }
            return (model.t("tasks.task.\(id)"), spec["tools"] != nil)
        }
    }

    private func card(_ group: Group, tasks: [(name: String, tool: Bool)]) -> some View {
        let (title, note) = switch group {
        case .device: (model.t("tasks.device"), model.t("tasks.device.note"))
        case .first: (model.t("tasks.first"), model.t("tasks.first.note"))
        case .cloud: (model.t("tasks.cloud"), model.t("tasks.cloud.note"))
        case .none: (model.t("tasks.none"), model.t("tasks.none.note"))
        }
        return Card(radius: 20) {
            HStack(spacing: 8) {
                legend(group)
                Text(title).sfFont(17, weight: .semibold).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Text(tasks.map(\.name).joined(separator: " · "))
                .sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
            if group == .cloud, tasks.contains(where: \.tool) {
                NoteText(text: model.t("tasks.flags")).padding(.top, 4)
            }
            NoteText(text: note).padding(.top, 6)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tasks.\(String(describing: group))")
    }

    /// Why hybrid, measured (contract v1.29): the figures of the latest bundled run on a real iPhone,
    /// computed from its file, and the conclusion they support.
    private var measured: some View {
        Card(radius: 20) {
            Text(model.t("tasks.measured.title")).sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
            NoteText(text: model.t("tasks.measured.lead")).padding(.top, 6)
            RecordedFigures().padding(.top, 10)
            NoteText(text: model.t("tasks.measured.why"), size: 15).padding(.top, 10)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tasks.measured")
    }

    /// How the routing is enforced on this iPhone (contract v1.35): the type a cloud-capable call does
    /// not accept, and App Check on every cloud request. (The browser guard and network check are the web's.)
    private var enforce: some View {
        Card(radius: 20) {
            Text(model.t("tasks.enforce.title")).sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
            NoteText(text: model.t("tasks.enforce.types"), size: 15).padding(.top, 8)
            NoteText(text: model.t("tasks.enforce.appCheck"), size: 15).padding(.top, 6)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tasks.enforce")
    }

    /// The Remote Config values in use, and whether they are the built-in defaults or fetched.
    private var config: some View {
        let c = model.currentConfig
        // Fetched once, right after the first cloud request (shared/RECORD.md section 1).
        let fetched = model.outbound.contains { $0.channel == .remoteConfig && $0.status == .sent(200) }
        let rows: [(String, String)] = [
            ("tasks.config.route_short_text_max_words", String(c.shortTextMaxWords)),
            // The label is the shared one written for the web key; the meaning is the same on iOS.
            ("tasks.config.route_ondevice_locales_web", c.onDeviceLocales.filter { AppLocale.offered.map(\.rawValue).contains($0) }.joined(separator: ", ")),
            ("tasks.config.prompt_pointer_extract_v", String(c.promptPointerExtractV)),
            ("tasks.config.prompt_explain_v", String(c.promptExplainV)),
            ("tasks.config.prompt_ask_v", String(c.promptAskV)),
        ]
        return Card(radius: 20) {
            Text(model.t("tasks.config.title")).sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
            NoteText(text: model.t("tasks.config.lead")).padding(.top, 6)
            NoteText(text: model.t(fetched ? "tasks.config.source.fetched" : "tasks.config.source.defaults"), size: 15)
                .padding(.top, 6)
            ForEach(rows, id: \.0) { key, value in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(model.t(key)).sfFont(15).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(verbatim: value).monoFont(15, weight: 500).foregroundStyle(theme.ink)
                }
                .padding(.top, 8)
                .accessibilityElement(children: .combine)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tasks.config")
    }

    /// The square of each group: ink, half ink half redact, redact, an empty square.
    @ViewBuilder private func legend(_ group: Group) -> some View {
        let shape = RoundedRectangle(cornerRadius: 3)
        switch group {
        case .device: shape.fill(theme.ink).frame(width: 14, height: 14)
        case .first:
            HStack(spacing: 0) { Rectangle().fill(theme.ink); Rectangle().fill(theme.redact) }
                .frame(width: 14, height: 14).clipShape(shape)
        case .cloud: shape.fill(theme.redact).frame(width: 14, height: 14)
        case .none: shape.strokeBorder(theme.ink, lineWidth: 1.5).frame(width: 14, height: 14)
        }
    }
}
