// Fast snapshot capture of every screen and state, without driving the flow through UI automation.
// Started with the launch argument `-SnapshotCapture <folder>` (UI tests and `make snapshots` only;
// ignored otherwise): the app sets each scene's state directly, renders it in light and dark, English
// and Spanish, default and largest text, and writes PNG files (each long screen also page by page).
// A scripted model stands in for Firebase AI Logic (`-UITestModel`); nothing is sent anywhere.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

/// Appearance and text size of the scene being captured.
@MainActor
@Observable
final class SnapshotStyle {
    var scheme: ColorScheme = .light
    var dynamicType: DynamicTypeSize = .large
}

struct SnapshotOptions {
    let folder: URL
    /// Scene names to capture (all when empty).
    let scenes: Set<String>
    /// `en-light`, `es-dark-ax5`… (all eight when empty).
    let configs: Set<String>

    init?(arguments: [String]) {
        guard let i = arguments.firstIndex(of: "-SnapshotCapture"), i + 1 < arguments.count else { return nil }
        folder = URL(fileURLWithPath: arguments[i + 1], isDirectory: true)
        func list(_ flag: String) -> Set<String> {
            guard let j = arguments.firstIndex(of: flag), j + 1 < arguments.count else { return [] }
            return Set(arguments[j + 1].split(separator: ",").map(String.init))
        }
        scenes = list("-SnapshotScenes")
        configs = list("-SnapshotConfigs")
    }
}

@MainActor
enum SnapshotRunner {
    struct Scene {
        let name: String
        /// Long screens are also captured page by page.
        var pages = 1
        /// Seconds to wait after setting the state (a scripted model answers in about 0.3 s).
        var wait: Double = 0.25
        /// Captured only when the (scripted) on-device model is available.
        var needsDevice = false
        /// Captured from the top of its scroll view (what opens in it may have scrolled it).
        var fromTop = false
        let setUp: (AppModel) async -> Void
    }

    static func scenes(_ model: AppModel) -> [Scene] {
        let bundle = model.bundle
        let steps = model.session.steps.map(\.id)
        var out: [Scene] = [
            Scene(name: "start") { _ in },
            Scene(name: "start-started") { m in m.answer("householdSize", .integer(3)) },
            Scene(name: "sheet-language") { m in m.sheet = .language },
            Scene(name: "sheet-draft-rules", pages: 2) { m in m.sheet = .demo },
            Scene(name: "sheet-delete") { m in m.sheet = .delete(back: .demo) },
        ]
        for (i, id) in steps.enumerated() {
            out.append(Scene(name: String(format: "question-%02d-%@", i + 1, id)) { m in
                m.tab = .check
                m.checkPath = steps.prefix(i + 1).map { .question($0, returnTo: nil) }
            })
        }
        out += [
            Scene(name: "results", pages: 3) { m in m.runPreparedHousehold() },
            Scene(name: "results-before-answers") { m in
                for id in steps { m.skip(id) }
                m.showResults()
            },
            Scene(name: "results-high-income", pages: 2) { m in
                m.runPreparedHousehold()
                m.answer("income", .income(.exact(250_000)))
            },
            // Exactly one program may qualify: the singular headline ("for 1 program").
            Scene(name: "results-one") { m in
                m.runPreparedHousehold()
                for amount in stride(from: 20_000, through: 200_000, by: 2_500) {
                    m.answer("income", .income(.exact(Double(amount))))
                    if m.results.filter({ $0.verdict == .likely }).count == 1 { break }
                }
            },
            // Nothing may qualify: the plain results title, never "0 programs" in display type.
            Scene(name: "results-none") { m in
                m.runPreparedHousehold()
                m.answer("income", .income(.exact(Double(QuickCheck.maxExactIncome))))
            },
            Scene(name: "results-offline") { m in
                m.forceOffline = true
                m.runPreparedHousehold()
            },
        ]
        for program in bundle.packInfo.programs {
            out.append(Scene(name: "program-\(program.id)", pages: 4) { m in
                m.runPreparedHousehold()
                m.openProgram(program.id)
            })
        }
        let first = bundle.packInfo.programs.first?.id ?? ""
        out += [
            Scene(name: "program-send-step", pages: 2, wait: 0.5) { m in
                m.runPreparedHousehold()
                m.openProgram(first)
                m.startAbout(first, long: false)
            },
            Scene(name: "program-answer", pages: 4, wait: 1.2) { m in
                m.runPreparedHousehold()
                m.openProgram(first)
                m.startAbout(first, long: false)
                m.send(m.aboutKey(first, long: false))
            },
            // The person's own result explained on this iPhone (device model only).
            Scene(name: "program-why-answer", pages: 3, wait: 1.2) { m in
                m.runPreparedHousehold()
                m.openProgram(first)
                m.explainPersonal(first)
            },
            Scene(name: "record-empty") { m in m.sheet = .record },
            Scene(name: "record-sent", pages: 2, wait: 1.2) { m in
                m.runPreparedHousehold()
                m.openProgram(first)
                m.startAbout(first, long: false)
                m.send(m.aboutKey(first, long: false))
                try? await Task.sleep(for: .seconds(0.8))
                m.sheet = .record
            },
            // The count headline at the top of the record ("0 SENT, 1 KEPT." on its highlight).
            Scene(name: "record-headline", wait: 1.0, fromTop: true) { m in
                m.openSamplePreview()
                await m.useRecordedCloud()
                m.sheet = .record
            },
            Scene(name: "record-deleted") { m in
                m.deleteEverything()
                m.sheet = .record
            },
            Scene(name: "add-document", pages: 2) { m in m.openDocument() },
            Scene(name: "preview-could-leave", pages: 3) { m in m.openSamplePreview() },
            Scene(name: "review-sample", pages: 4, wait: 1.0) { m in
                m.openSamplePreview()
                await m.readDocument(keepOnDevice: m.deviceModelAvailable)
            },
            // The recorded cloud reading of the sample (routing.json recordedCloud): the pointer card with the
            // line as the model saw it and on this iPhone; then the results it changed; then the record.
            Scene(name: "review-recorded-cloud", pages: 3, wait: 1.0) { m in
                m.openSamplePreview()
                await m.useRecordedCloud()
            },
            Scene(name: "results-document-effect", pages: 3, wait: 1.0) { m in
                m.startJudgesSample()
                await m.useRecordedCloud()
                m.editDocument { $0.confirmAll() }
                if let a = m.documentValidation?.annualization { m.useIncome(a) }
            },
            Scene(name: "record-recorded-cloud", pages: 2, wait: 1.0) { m in
                m.openSamplePreview()
                await m.useRecordedCloud()
                m.sheet = .record
            },
            // The reading shown as it happens (contract v1.43), held still mid-way: the silhouette going out, and
            // the placeholders back and turned into values; on this iPhone, to the cloud, and the recorded cloud reading.
            Scene(name: "reading-device-out") { m in m.openSamplePreview(); m.stillShow(.device, .out) },
            Scene(name: "reading-device-back") { m in m.openSamplePreview(); m.stillShow(.device, .back) },
            Scene(name: "reading-cloud-out") { m in m.openSamplePreview(); m.stillShow(.cloud(afterDevice: false), .out) },
            Scene(name: "reading-cloud-back") { m in m.openSamplePreview(); m.stillShow(.cloud(afterDevice: false), .back) },
            Scene(name: "reading-recorded-out") { m in m.openSamplePreview(); m.stillShow(.recordedCloud, .out) },
            // Both halves of the hybrid on the judges' path (contract v1.44), held still: the recorded on-device
            // reading going out and coming back, the recorded cloud reading coming back; then the review with
            // both answers side by side, the record of what left, and the results.
            Scene(name: "both-device-out") { m in m.startJudgesSample(); await m.stillBoth(cloud: false, .out) },
            Scene(name: "both-device-back") { m in m.startJudgesSample(); await m.stillBoth(cloud: false, .back) },
            Scene(name: "both-cloud-out") { m in m.startJudgesSample(); await m.stillBoth(cloud: true, .out) },
            Scene(name: "both-cloud-back") { m in m.startJudgesSample(); await m.stillBoth(cloud: true, .back) },
            Scene(name: "review-both", pages: 3, wait: 1.0) { m in await m.readBothWaysForSnapshot() },
            Scene(name: "review-both-live", pages: 2, wait: 1.5, needsDevice: true) { m in await m.readBothWaysForSnapshot() },
            // The cloud half read now (contract v1.47): with `-UITestModel cloud` a live answer; without a cloud,
            // the recording with the reason the live reading did not complete.
            Scene(name: "review-both-cloud", pages: 2, wait: 1.5) { m in await m.readBothWaysForSnapshot(live: true) },
            Scene(name: "both-live-cloud-out") { m in m.startJudgesSample(); await m.stillBoth(cloud: true, .out, live: true) },
            Scene(name: "record-both", pages: 3, wait: 1.0, fromTop: true) { m in
                await m.readBothWaysForSnapshot()
                m.sheet = .record
            },
            // With `-UITestModel cloud`: the sample's silhouette sent to be read; the record opens on what left.
            Scene(name: "record-document-sent", pages: 2, wait: 1.0, fromTop: true) { m in
                m.openSamplePreview()
                await m.readDocument()
                m.sheet = .record
            },
            Scene(name: "results-both", pages: 3, wait: 1.0) { m in
                await m.readBothWaysForSnapshot()
                if let a = m.documentValidation?.annualization { m.useIncome(a) }
            },
            Scene(name: "review-type-numbers", pages: 3) { m in
                m.openDocument()
                m.typeNumbers()
            },
            Scene(name: "judges", pages: 2) { m in m.open(.judges) },
            Scene(name: "tasks") { m in m.open(.tasks) },
            Scene(name: "device-check", pages: 2) { m in m.open(.deviceCheck) },
            Scene(name: "device-check-recording", pages: 6) { m in
                m.snapshotDeviceCheck = "recording"
                m.open(.deviceCheck)
            },
            // A held-out run recorded on an iPhone (eval/on-device/heldout/), when one is bundled.
            Scene(name: "device-check-heldout", pages: 8) { m in
                m.snapshotDeviceCheck = "heldout"
                m.open(.deviceCheck)
            },
            // The held-out paystubs read by the scripted on-device model.
            Scene(name: "device-check-heldout-run", pages: 8, wait: 30, needsDevice: true) { m in
                m.snapshotDeviceCheck = "heldout-run"
                m.open(.deviceCheck)
            },
            // With `-UITestModel device`: the whole check, run by the scripted on-device model; the reading kept on
            // the device (`device-unreliable`, `device-notread`: the other outcomes).
            Scene(name: "device-check-run", pages: 6, wait: 14, needsDevice: true) { m in
                m.snapshotDeviceCheck = "run"
                m.open(.deviceCheck)
            },
            Scene(name: "preview-keep", pages: 2, wait: 1.5, needsDevice: true) { m in
                m.openSamplePreview()
                await m.readDocument(keepOnDevice: true)
            },
        ]
        return out
    }

    struct Config {
        let name: String
        let locale: AppLocale
        let scheme: ColorScheme
        let size: DynamicTypeSize
    }

    static let configs: [Config] = [AppLocale.en, .es].flatMap { locale in
        [ColorScheme.light, .dark].flatMap { scheme in
            [DynamicTypeSize.large, .accessibility5].map { size in
                Config(name: "\(locale.rawValue)-\(scheme == .dark ? "dark" : "light")\(size == .large ? "" : "-ax5")",
                       locale: locale, scheme: scheme, size: size)
            }
        }
    }

    static func run(model: AppModel, style: SnapshotStyle, options: SnapshotOptions) async {
        MotionSwitch.off = true
        UIView.setAnimationsEnabled(false)
        try? FileManager.default.createDirectory(at: options.folder, withIntermediateDirectories: true)
        let started = Date()
        var count = 0
        let scenes = scenes(model).filter {
            (options.scenes.isEmpty || options.scenes.contains($0.name)) && (!$0.needsDevice || model.deviceModelAvailable)
        }
        for config in configs where options.configs.isEmpty || options.configs.contains(config.name) {
            style.scheme = config.scheme
            style.dynamicType = config.size
            for scene in scenes {
                model.forceOffline = false
                model.resetForSnapshot(locale: config.locale)
                try? await Task.sleep(for: .seconds(0.05))
                await scene.setUp(model)
                try? await Task.sleep(for: .seconds(scene.wait))
                if scene.fromTop, let window = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first,
                   let scroll = mainScrollView(in: window) {
                    scroll.setContentOffset(CGPoint(x: 0, y: -scroll.adjustedContentInset.top), animated: false)
                    try? await Task.sleep(for: .seconds(0.2))
                }
                count += capture(name: "\(config.name)-\(scene.name)", pages: scene.pages, folder: options.folder)
            }
        }
        let seconds = Int(Date().timeIntervalSince(started))
        let done = options.folder.appendingPathComponent("DONE.txt")
        try? Data("\(count) images in \(seconds) s\n".utf8).write(to: done)
    }

    /// The window as it is now, then each further page of its main scroll view.
    static func capture(name: String, pages: Int, folder: URL) -> Int {
        guard let window = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return 0 }
        func write(_ suffix: String) {
            let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            }
            try? image.pngData()?.write(to: folder.appendingPathComponent("\(name)\(suffix).png"))
        }
        write("")
        guard pages > 1, let scroll = mainScrollView(in: window) else { return 1 }
        var written = 1
        let step = max(200, scroll.bounds.height - scroll.adjustedContentInset.bottom - 160)
        for page in 2...pages {
            let maxY = scroll.contentSize.height + scroll.adjustedContentInset.bottom - scroll.bounds.height
            let y = min(CGFloat(page - 1) * step - scroll.adjustedContentInset.top, maxY)
            guard y > scroll.contentOffset.y + 1 else { break }
            scroll.setContentOffset(CGPoint(x: 0, y: y), animated: false)
            RunLoop.main.run(until: Date().addingTimeInterval(0.15))
            write("-p\(page)")
            written += 1
        }
        scroll.setContentOffset(CGPoint(x: 0, y: -scroll.adjustedContentInset.top), animated: false)
        return written
    }

    /// The tallest visible scroll view (a sheet's when a sheet is open, since it is drawn last).
    static func mainScrollView(in view: UIView) -> UIScrollView? {
        var found: [UIScrollView] = []
        func walk(_ v: UIView) {
            if let s = v as? UIScrollView, !s.isHidden, s.bounds.height > 200, s.contentSize.height > s.bounds.height { found.append(s) }
            v.subviews.forEach(walk)
        }
        walk(view)
        return found.last
    }
}

extension AppModel {
    /// Snapshots: the reading staged and held still. The values come from the sample's recorded reading.
    func stillShow(_ route: ReadingShow.Route, _ phase: ReadingShow.Phase) {
        guard let silhouette, let recording = recordedCloudReading else { return }
        var pairs: [ReadingShow.Pair] = []
        if phase == .back {
            editDocument { $0.apply(recording.result, silhouette: silhouette, schema: bundle.paystubSchema) }
            pairs = ReadingShow.pairs(document, silhouette: silhouette)
        }
        readingShow = ReadingShow(route: route, phase: phase, pairs: pairs, still: 0.3)
    }

    /// Snapshots: one half of the sample read both ways, held still. The device's answer is the recorded
    /// on-device reading; the cloud's, the recorded cloud reading.
    func stillBoth(cloud: Bool, _ phase: ReadingShow.Phase, live: Bool = false) async {
        guard let silhouette, let found = await RecordedDeviceReading.matching(
            deviceRecordings, silhouette: silhouette, language: document.language, key: sampleKey,
            schema: bundle.paystubSchema, jurisdiction: bundle.packInfo.jurisdiction) else { return }
        editDocument { $0.apply(found.result, silhouette: silhouette, schema: bundle.paystubSchema, recordedDate: found.recording.date) }
        var answer = document
        if cloud, let recording = recordedCloudReading {
            answer.apply(recording.result, silhouette: silhouette, schema: bundle.paystubSchema)
        }
        let route: ReadingShow.Route = cloud ? (live ? .compareInCloud : .recordedCloud) : .recordedDevice(machine: machineName(found.recording), date: found.recording.day)
        readingShow = ReadingShow(route: route, phase: phase, pairs: phase == .back ? ReadingShow.pairs(answer, silhouette: silhouette) : [],
                                  still: 0.3, both: true)
    }

    /// Snapshots: the judges' path read both ways, at the review (the device now when it has the model). `live`:
    /// the cloud half read now as on the one press (contract v1.47; the scripted cloud, or the fallback without it).
    func readBothWaysForSnapshot(live: Bool = false) async {
        startJudgesSample()
        if deviceModelAvailable { await readDocument(keepOnDevice: true, review: false) } else { await useRecordedDevice(both: true) }
        if live { await readCloudHalf() } else { await playRecordedCloudHalf() }
        editDocument { $0.confirmAll() }
        paystubPath.append(.documentReview)
    }
}
