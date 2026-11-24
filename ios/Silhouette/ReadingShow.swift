// The reading shown as it happens (contract v1.43): the silhouette's lines travel to the model, on this
// iPhone or in the cloud, labelled with where and why; the answer comes back as placeholder chips (N12…),
// which turn into the values here, on this iPhone; then the review. The two ways look different at a
// glance: on this iPhone everything stays inside one ink block, the model included; to the cloud the lines
// leave the block across a dashed orange edge, to an orange block outside it. Under Reduce Motion the
// stages are the same text, with nothing moving.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

/// What the staging shows now.
struct ReadingShow: Equatable {
    enum Route: Equatable {
        case device
        /// `afterDevice`: this iPhone could not read it reliably, so it went on to the cloud.
        case cloud(afterDevice: Bool)
        /// A recorded cloud reading (routing.json `recordedCloud`): nothing is sent now.
        case recordedCloud
        /// The judges' path's cloud half read now (routing.json `bothWays`, contract v1.47): the same silhouette,
        /// sent to the cloud to compare with the device's answer.
        case compareInCloud
        /// A recorded on-device reading (routing.json `recordedSample`), made on the iPhone named, on `date`
        /// (ISO day): the device's way, nothing sent.
        case recordedDevice(machine: String, date: String)

        /// The device's way: everything stays inside the block, the model included.
        var isDevice: Bool {
            switch self {
            case .device, .recordedDevice: true
            default: false
            }
        }
        var isRecordedDevice: Bool { if case .recordedDevice = self { true } else { false } }
    }

    enum Phase: Equatable { case out, back }

    /// A field the model answered with a placeholder, and the value this iPhone put back.
    struct Pair: Equatable, Identifiable {
        let field: String
        let ref: String
        let value: String
        var id: String { field }
    }

    var route: Route
    var phase: Phase = .out
    var pairs: [Pair] = []
    /// When this phase started (the moving chips run from it).
    var since = Date()
    /// Snapshots and UI tests: the moving chips drawn still, at this point of their way (0…1).
    var still: Double? = nil
    /// One half of the sample read both ways (the judges' path, contract v1.44): headed "On a device" or
    /// "In the cloud", as the review's card names the two answers.
    var both = false

    /// The fields that decide the yearly income, as the model answered them and as this iPhone fills them
    /// in: at most four, each with a single placeholder.
    static func pairs(_ document: DocumentSession, silhouette: SkeletonResult) -> [Pair] {
        pairs(document, silhouette: silhouette, order: ["grossPay", "ytdGross", "payDate", "periodEnd", "netPay", "periodStart"], limit: 4)
    }

    static func pairs(_ document: DocumentSession, silhouette: SkeletonResult, order: [String], limit: Int) -> [Pair] {
        guard let pointers = document.pointers else { return [] }
        let found = Set(document.fieldsForDisplay.filter(\.found).map(\.name))
        var out: [Pair] = []
        for name in order where found.contains(name) && out.count < limit {
            guard let ref = pointers[name]?.stringValue,
                  let value = DocumentSession.line(of: silhouette, containing: ref)?.lazy.compactMap({ seg -> String? in
                      if case .placeholder(let id, _, let original) = seg, id == ref { return original }
                      return nil
                  }).first
            else { continue }
            out.append(Pair(field: name, ref: ref, value: value))
        }
        return out
    }
}

struct ReadingStageView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.verticalSizeClass) private var verticalSize
    let show: ReadingShow

    private var device: Bool { show.route.isDevice }

    /// The silhouette lines that hold placeholders: what goes to the model (at most five).
    private var lines: [[DocumentCard.Token]] {
        guard let silhouette = model.silhouette else { return [] }
        let all = DocumentCard.lines(DocumentSession.segments(of: silhouette.skeleton))
        return Array(all.filter { line in line.contains { if case .value = $0 { true } else { false } } }.prefix(5))
    }

    /// The placeholder ids that travel: out, the silhouette's own; back, the ones the model answered.
    private var travelling: [String] {
        switch show.phase {
        case .back: return show.pairs.map(\.ref)
        case .out:
            let ids = lines.flatMap { line in line.compactMap { if case .value(let id, _, _) = $0 { id } else { nil } } }
            return Array(ids.prefix(3))
        }
    }

    private var stageText: String {
        switch show.phase {
        case .back: model.t("preview.stage.pointersBack")
        case .out:
            if case .recordedDevice(_, let date) = show.route {
                // A recording: the device's own answer, made then; nothing goes anywhere now.
                model.t("preview.useRecordedNote", ["date": model.recordedDay(date)])
            } else {
                model.t(device ? "preview.stage.toDevice" : "preview.stage.toCloud")
            }
        }
    }

    /// Why it goes this way (routing.json), and for a recording that nothing is sent now.
    private var reasonText: String {
        switch show.route {
        case .device: model.t("reason.document-silhouette-only")
        case .cloud(let after):
            after ? model.t("reason.on-device-failed")
                : model.t("reason.document-silhouette-only") + " (" + model.t("reason.detail.noDeviceModel") + ")"
        case .recordedCloud: model.t("reason.recorded-in-cloud")
        case .recordedDevice: model.t("reason.recorded-on-device")
        case .compareInCloud: model.t("reason.compare-in-cloud")
        }
    }

    /// Where and when a recording was made ("Recorded on iPhone 17 Pro, Nov 19, 2026"), for the recorded ways.
    private var recordedLine: String? {
        switch show.route {
        case .recordedDevice(let machine, let date):
            return Self.sentenceCase(model.t("review.both.recordedOn", ["machine": machine, "date": model.recordedDay(date)]))
        case .recordedCloud:
            guard let r = model.recordedCloudReading else { return nil }
            return model.t("review.both.recordedCloud", ["model": r.model, "date": model.recordedDay(r.date)])
        default: return nil
        }
    }

    static func sentenceCase(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

    private var badge: (kind: WhereRan, label: String) {
        switch show.route {
        case .device: (.device, model.t("badge.onDevice"))
        case .cloud, .compareInCloud: (.cloud, model.t("badge.cloud"))
        case .recordedCloud: (.cloud, model.t("badge.recordedCloud"))
        case .recordedDevice: (.device, model.t("badge.recorded"))
        }
    }

    private var headline: String {
        switch show.route {
        case .device: model.t("send.staysHere")
        case .cloud: model.t("send.goesCloud")
        case .compareInCloud: model.t(show.both ? "review.both.cloud" : "send.goesCloud")
        case .recordedCloud: model.t(show.both ? "review.both.cloud" : "badge.recordedCloud")
        case .recordedDevice: model.t("review.both.device")
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                diagram
            }
            .gutter()
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(theme.ground.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("reading.show")
        .onChange(of: show.phase, initial: true) { _, _ in
            AccessibilityNotification.Announcement(stageText).post()
        }
    }

    // MARK: Header: where, why, and the stage

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            WhereBadge(kind: badge.kind, label: badge.label)
                .accessibilityIdentifier("reading.badge")
            Display(text: headline, size: 44, maxLines: 2)
                .accessibilityIdentifier("reading.route")
            Text(stageText)
                .sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
                .animation(Motion.named(Motion.fade), value: stageText)
                .accessibilityIdentifier("reading.stage")
            Text(reasonText).sfFont(13).foregroundStyle(theme.note)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("reading.reason")
            if let recordedLine {
                Text(recordedLine).sfFont(13, weight: .semibold).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("reading.recordedOn")
            }
            // While this iPhone reads, which part it is on (DEVICE_READING.md section 7).
            if device, show.phase == .out, let stage = model.readingStage, stage != .sendingAfterDevice {
                SpinnerLine(text: model.t(stage.copyKey))
            }
        }
    }

    // MARK: The way it goes

    @ViewBuilder private var diagram: some View {
        let compact = verticalSize == .compact
        VStack(spacing: 0) {
            if !device {
                cloudBlock
                lane(height: compact ? 56 : 76, up: show.phase == .out, cloud: true)
            }
            phoneBlock(compact: compact)
        }
        .animation(Motion.named(Motion.reveal), value: show.route)
    }

    /// The model in the cloud: an orange block outside this iPhone, edged with the dashed line of what leaves.
    private var cloudBlock: some View {
        HStack(spacing: 10) {
            Image(systemName: show.route == .recordedCloud ? "record.circle" : "cloud.fill").sfFont(20, weight: .semibold)
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: "Firebase AI Logic").sfFont(17, weight: .bold)
                Text(badge.label).sfFont(13, weight: .semibold)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(theme.onRedact)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.redact))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(theme.onRedact.opacity(0.85), style: StrokeStyle(lineWidth: 1.5, dash: [5, 3])))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("reading.cloud")
    }

    /// This iPhone: an ink block that holds the silhouette (then the values), and on the device route the model.
    private func phoneBlock(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: show.route.isRecordedDevice ? "record.circle" : "iphone").sfFont(13, weight: .semibold)
                Text(phoneLabel).sfFont(13, weight: .semibold)
            }
            .foregroundStyle(theme.onHeroMuted)
            .accessibilityHidden(true)
            if show.phase == .out { silhouetteCard } else { valuesCard }
            if device {
                lane(height: compact ? 44 : 60, up: show.phase == .back, cloud: false)
                modelBlock
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            // Solid on this iPhone; the edge the silhouette crosses is dashed orange on its way to the cloud.
            RoundedRectangle(cornerRadius: 28).fill(theme.hero)
        }
        .overlay {
            if !device {
                RoundedRectangle(cornerRadius: 28).strokeBorder(theme.redact, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
            }
        }
        .environment(\.colorScheme, .dark)
    }

    /// The block's label: this iPhone; for a recorded on-device reading, the iPhone it was recorded on.
    private var phoneLabel: String {
        if case .recordedDevice(let machine, _) = show.route { return machine }
        return model.t("preview.onPhone")
    }

    /// The model on this iPhone, inside the block.
    private var modelBlock: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles").sfFont(18, weight: .semibold)
            Text(model.t("judges.factModel")).sfFont(17, weight: .bold)
            Spacer(minLength: 0)
        }
        .foregroundStyle(Color(red: 0.055, green: 0.055, blue: 0.055))
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, minHeight: 56)
        .background(RoundedRectangle(cornerRadius: 18).fill(.white))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("reading.deviceModel")
    }

    /// The silhouette as it goes: its lines with placeholders, values never.
    private var silhouetteCard: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(model.t("preview.couldLeave")).sfFont(12, weight: .semibold).foregroundStyle(theme.note)
            // Long lines run on under the card's edge (they never set the width of the screen).
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        HStack(spacing: 0) {
                            ForEach(Array(line.enumerated()), id: \.offset) { _, token in tokenView(token) }
                        }
                    }
                }
            }
            .scrollDisabled(true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(red: 0.97, green: 0.97, blue: 0.97)))
        .environment(\.colorScheme, .light)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.t("preview.couldLeave"))
        .accessibilityIdentifier("reading.silhouette")
    }

    @ViewBuilder private func tokenView(_ token: DocumentCard.Token) -> some View {
        let mono = Font(DesignFonts.uiFont(.mono, weight: 400, size: 11))
        switch token {
        case .text(let s), .word(let s): Text(verbatim: s).font(mono).foregroundStyle(Color(red: 0.055, green: 0.055, blue: 0.055)).fixedSize()
        case .value(let id, _, _): TokenChip(id: id, size: 10, compact: true).padding(.trailing, 2)
        }
    }

    /// The answer, back on this iPhone: each placeholder the model answered, then the value it stands for.
    private var valuesCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(show.pairs.enumerated()), id: \.element.id) { i, pair in
                PairRow(pair: pair, label: model.t("field.paystub.\(pair.field)"), index: i, still: show.still != nil)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(red: 0.97, green: 0.97, blue: 0.97)))
        .environment(\.colorScheme, .light)
        .transition(.opacity)
    }

    /// The way between this iPhone's silhouette and the model: chips moving along it, up or down. In the cloud
    /// the chips are orange and the way crosses out of the ink block; on this iPhone they stay inside it.
    private func lane(height: CGFloat, up: Bool, cloud: Bool) -> some View {
        let ids = travelling
        let color = cloud ? theme.redact : Color.white
        return ZStack {
            Path { p in p.move(to: CGPoint(x: 0.5, y: 0)); p.addLine(to: CGPoint(x: 0.5, y: height)) }
                .stroke(color.opacity(cloud ? 0.9 : 0.45), style: StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
                .frame(width: 1, height: height)
            if reduceMotion && show.still == nil {
                // Nothing moves: an arrow says which way.
                Image(systemName: up ? "arrow.up" : "arrow.down").sfFont(17, weight: .bold).foregroundStyle(color)
                    .padding(6).background(Circle().fill(cloud ? theme.ground : theme.hero))
            } else {
                TimelineView(.animation(paused: show.still != nil)) { context in
                    let t = context.date.timeIntervalSince(show.since)
                    GeometryReader { g in
                        ForEach(Array(ids.enumerated()), id: \.offset) { i, id in
                            let p = show.still.map { min(1, $0 + Double(i) * 0.28) } ?? (t / 0.9 + Double(i) / Double(max(ids.count, 1))).truncatingRemainder(dividingBy: 1)
                            let y = up ? height * (1 - p) : height * p
                            let x = g.size.width * (ids.count == 1 ? 0.5 : 0.28 + 0.44 * Double(i) / Double(ids.count - 1))
                            chip(id, cloud: cloud)
                                .position(x: x, y: y)
                                .opacity(min(1, p * 5, (1 - p) * 5))
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: height, maxHeight: height)
        .accessibilityHidden(true)
    }

    private func chip(_ id: String, cloud: Bool) -> some View {
        Text(verbatim: id)
            .font(Font(DesignFonts.uiFont(.mono, weight: 600, size: 12)))
            .foregroundStyle(cloud ? theme.onRedact : Color(red: 0.055, green: 0.055, blue: 0.055))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 6).fill(cloud ? theme.redact : .white))
            .fixedSize()
    }
}

/// "Gross pay this period  [N12] → 1,271.88": the chip arrives first, then the value it stands for, from
/// this iPhone's own copy of the document.
private struct PairRow: View {
    @Environment(\.theme) private var theme
    let pair: ReadingShow.Pair
    let label: String
    let index: Int
    var still = false
    @State private var turned = false

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).sfFont(12, weight: .semibold).foregroundStyle(theme.note)
            HStack(spacing: 8) {
                TokenChip(id: pair.ref, size: 13)
                Image(systemName: "arrow.right").sfFont(12, weight: .bold).foregroundStyle(theme.note)
                    .opacity(turned ? 1 : 0)
                Text(verbatim: pair.value)
                    .font(Font(DesignFonts.uiFont(.mono, weight: 600, size: 16)))
                    .foregroundStyle(theme.ink)
                    .fixedSize()
                    .opacity(turned ? 1 : 0)
                    .offset(x: turned || Motion.reduceMotion ? 0 : -10)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(pair.ref), \(pair.value)")
        .accessibilityIdentifier("reading.pair.\(pair.field)")
        .onAppear {
            if still || MotionSwitch.off { turned = true; return }
            withAnimation(Motion.named(Motion.reveal)?.delay(0.35 + Double(index) * 0.15)) { turned = true }
        }
    }
}
