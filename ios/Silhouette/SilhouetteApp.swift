import SilhouetteCore
import SilhouetteKit
import SwiftUI

@main
struct SilhouetteApp: App {
    @State private var model: Result<AppModel, Error>

    init() {
        let options = LaunchOptions(arguments: ProcessInfo.processInfo.arguments)
        if options.testModel == nil { FirebaseServices.configure() }
        _model = State(initialValue: Result {
            let shared = try Bundle.main.resourceURL.map { $0.appendingPathComponent("Shared", isDirectory: true) }
                .orThrow(SharedBundle.ContentError.missing("Shared"))
            let local = try Bundle.main.url(forResource: "copy.local", withExtension: "json")
                .map { try JSON.parse(Data(contentsOf: $0)) }
            let bundle = try SharedBundle(directory: shared, jurisdiction: AppModel.jurisdiction, localCopy: local)
            let model = try AppModel(bundle: bundle, store: AnswerStore(), resetOnLaunch: options.resetAll, testModel: options.testModel)
            model.forceOffline = options.offline
            if let repetitions = options.deviceCheckRun {
                model.autoRunDeviceCheck = repetitions
                model.open(.deviceCheck)
            }
            return model
        })
        self.options = options
    }

    private let options: LaunchOptions
    /// The fast snapshot capture: only with a scripted model, never with Firebase.
    private var snapshot: SnapshotOptions? { options.testModel == nil ? nil : SnapshotOptions(arguments: ProcessInfo.processInfo.arguments) }
    @State private var snapshotStyle = SnapshotStyle()

    var body: some Scene {
        WindowGroup {
            switch model {
            case .success(let model):
                if let snapshot {
                    RootView()
                        .environment(model)
                        .environment(\.theme, model.theme)
                        .environment(\.locale, Locale(identifier: model.locale.rawValue))
                        .environment(\.dynamicTypeSize, snapshotStyle.dynamicType)
                        .preferredColorScheme(snapshotStyle.scheme)
                        .tint(model.theme.ink)
                        .task { await SnapshotRunner.run(model: model, style: snapshotStyle, options: snapshot) }
                } else {
                    RootView()
                        .environment(model)
                        .environment(\.theme, model.theme)
                        .environment(\.locale, Locale(identifier: model.locale.rawValue))
                        .preferredColorScheme(options.colorScheme)
                        .tint(model.theme.ink)
                }
            case .failure(let error):
                Text(String(describing: error))
                    .font(.callout.monospaced())
                    .padding()
            }
        }
    }
}

/// Launch arguments used by UI tests and screenshots. Without them the app behaves normally.
struct LaunchOptions {
    /// `-UITestResetAll`: start from a clean device state (deletes saved answers and the key).
    let resetAll: Bool
    /// `-UITestAppearance dark|light`
    let colorScheme: ColorScheme?
    /// `-UITestModel none|device|cloud`: a scripted model, no Firebase and no network.
    let testModel: String?
    /// `-UITestOffline`: show the offline state.
    let offline: Bool
    /// `-DeviceCheckRun 1|3`: open the on-device check and run it at once (each extraction case once or
    /// three times), for collecting a run without tapping through the app. The run file is saved in the
    /// app's Documents folder when it finishes.
    let deviceCheckRun: Int?

    init(arguments: [String]) {
        resetAll = arguments.contains("-UITestResetAll")
        offline = arguments.contains("-UITestOffline")
        if let i = arguments.firstIndex(of: "-DeviceCheckRun"), i + 1 < arguments.count, let n = Int(arguments[i + 1]) {
            deviceCheckRun = max(1, min(n, 3))
        } else {
            deviceCheckRun = nil
        }
        if let i = arguments.firstIndex(of: "-UITestModel"), i + 1 < arguments.count { testModel = arguments[i + 1] } else { testModel = nil }
        if let i = arguments.firstIndex(of: "-UITestAppearance"), i + 1 < arguments.count {
            colorScheme = arguments[i + 1] == "dark" ? .dark : arguments[i + 1] == "light" ? .light : nil
        } else {
            colorScheme = nil
        }
    }
}

extension Optional {
    func orThrow(_ error: @autoclosure () -> Error) throws -> Wrapped {
        guard let self else { throw error() }
        return self
    }
}
