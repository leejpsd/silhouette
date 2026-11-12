import SwiftUI

struct ContentView: View {
    private let copy = Result { try AppCopy() }

    private var appName: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Silhouette"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(appName)
                .font(.largeTitle.bold())
                .accessibilityAddTraits(.isHeader)
            switch copy {
            case .success(let copy):
                Text(copy["promise.line1"])
                    .font(.title3)
                    .accessibilityIdentifier("promise.line1")
            case .failure(let error):
                Text(String(describing: error))
                    .font(.callout.monospaced())
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
    }
}

#Preview {
    ContentView()
}
