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
