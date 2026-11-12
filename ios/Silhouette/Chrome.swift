// Persistent chrome: navigation with the wordmark and language switch, the demo banner, the
// "Leaving your device" bar, and "Delete everything".

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        @Bindable var model = model
        NavigationStack(path: $model.path) {
            StartScreen()
                .appToolbar()
                .navigationDestination(for: Route.self) { route in
                    Group {
                        switch route {
                        case .question(let id, let returnTo):
                            QuestionScreen(stepId: id, returnTo: returnTo).id(route)
                        case .results:
                            ResultsScreen()
                        case .program(let id):
                            ProgramScreen(programId: id)
                        }
                    }
                    .appToolbar()
                }
        }
        .tint(theme.primary)
        .safeAreaInset(edge: .bottom, spacing: 0) { LeavingBar() }
    }
}

private struct AppToolbar: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    func body(content: Content) -> some View {
        content
            .navigationBarTitleDisplayMode(.inline)
            .toolbarRole(.editor)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: theme.space("xs")) {
                        SilhouetteMark(style: .brand, size: 24)
                        Text(verbatim: "Silhouette").font(.headline).foregroundStyle(theme.text)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text(verbatim: "Silhouette"))
                }
                ToolbarItem(placement: .topBarTrailing) { LanguageMenu() }
            }
            .toolbarBackground(theme.surface, for: .navigationBar)
    }
}

extension View {
    func appToolbar() -> some View { modifier(AppToolbar()) }
}

struct LanguageMenu: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            ForEach(AppLocale.allCases) { locale in
                Button {
                    model.setLocale(locale)
                } label: {
                    if locale == model.locale {
                        Label(locale.nativeName, systemImage: "checkmark")
                    } else {
                        Text(locale.nativeName)
                    }
                }
                .accessibilityIdentifier("language.\(locale.rawValue)")
            }
        } label: {
            Label {
                Text(model.locale.nativeName)
            } icon: {
                Image(systemName: "globe")
            }
            .labelStyle(.iconOnly)
            .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(model.t("nav.language"))
        .accessibilityValue(model.locale.nativeName)
        .accessibilityIdentifier("language.menu")
    }
}

// MARK: - Demo banner

struct DemoBanner: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 0) {
            // Striped tape on the leading edge marks test content.
            Canvas { context, size in
                var x: CGFloat = -size.height
                while x < size.width + size.height {
                    var p = Path()
                    p.move(to: CGPoint(x: x, y: size.height))
                    p.addLine(to: CGPoint(x: x + size.height, y: 0))
                    context.stroke(p, with: .color(theme.onNotice), lineWidth: 3)
                    x += 8
                }
            }
            .frame(width: 10)
            .clipped()
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: theme.space("xxs")) {
                Text(model.t("demo.title")).tokenFont(.bodyStrong).accessibilityAddTraits(.isHeader)
                Text(model.t("demo.body")).tokenFont(.small)
            }
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(theme.onNotice)
            .padding(theme.space("sm"))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(theme.notice)
        .clipShape(RoundedRectangle(cornerRadius: theme.radius("control")))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("demo.banner")
    }
}

// MARK: - Leaving your device

struct LeavingBar: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @State private var showDetails = false
    @State private var keyboardShown = false

    private var status: String { model.outboundSummary }

    var body: some View {
        Group {
            // While the keyboard is up the bar would sit on top of it and cover the field.
            if !keyboardShown { bar }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardShown = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardShown = false }
        .sheet(isPresented: $showDetails) {
            LeavingDetails()
                .environment(model)
                .environment(\.theme, theme)
                .presentationDetents([.medium, .large])
        }
    }

    private var bar: some View {
        Button {
            showDetails = true
        } label: {
            HStack(spacing: theme.space("sm")) {
                Image(systemName: model.outbound.isEmpty ? "lock.shield" : "arrow.up.forward.circle")
                    .font(.title3)
                    .foregroundStyle(theme.primary)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text(model.t("leaving.title")).tokenFont(.bodyStrong).foregroundStyle(theme.text)
                    Text(status).tokenFont(.small).foregroundStyle(theme.textMuted)
                        .accessibilityIdentifier("leaving.status")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.up").foregroundStyle(theme.textMuted).accessibilityHidden(true)
            }
            .padding(.horizontal, theme.space("md"))
            .padding(.vertical, theme.space("xs"))
            .frame(minHeight: theme.minTapTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(theme.border).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(model.t("leaving.title")). \(status)")
        .accessibilityHint(model.t("leaving.details"))
        .accessibilityIdentifier("leaving.bar")
        // Persistent chrome stops growing at the largest standard size, like system bars; the
        // Large Content Viewer shows it enlarged, and the details sheet scales fully.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityShowsLargeContentViewer {
            Label(status, systemImage: "lock.shield")
        }
    }
}

struct LeavingDetails: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space("md")) {
                    ScreenHeading(text: model.t("leaving.title"))
                    Text(model.outboundSummary).tokenFont(.bodyStrong)
                    Text(model.t("leaving.body")).tokenFont(.body)
                    Text(model.t("leaving.network")).tokenFont(.small).foregroundStyle(theme.textMuted)
                    ForEach(model.outbound) { entry in
                        VStack(alignment: .leading, spacing: theme.space("xxs")) {
                            Text(entry.fields.map(model.outboundFieldName).joined(separator: ", "))
                                .tokenFont(.bodyStrong)
                            Text(model.t("outbound.sentTo", ["destination": entry.destination])).tokenFont(.small)
                            if let payload = entry.payload {
                                DisclosureGroup(model.t("outbound.showPayload")) {
                                    Text(payload.text).font(.footnote.monospaced()).textSelection(.enabled)
                                }
                            }
                        }
                        .padding(theme.space("sm"))
                        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                    }
                }
                .foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(theme.space("md"))
            }
            .background(theme.background)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.t("leaving.hide")) { dismiss() }
                        .accessibilityIdentifier("leaving.hide")
                }
            }
        }
    }
}

// MARK: - Footer with Delete everything

struct AppFooter: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @State private var confirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            Divider().overlay(theme.border)
            Text(model.t("promise.line3"))
                .tokenFont(.small)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            Button(role: .destructive) {
                confirming = true
            } label: {
                Label(model.t("delete.all"), systemImage: "trash")
            }
            .buttonStyle(.dangerAction)
            .accessibilityIdentifier("delete.all")
        }
        .padding(.top, theme.space("lg"))
        .alert(model.t("delete.title"), isPresented: $confirming) {
            Button(model.t("delete.confirm"), role: .destructive) { model.deleteEverything() }
                .accessibilityIdentifier("delete.confirm")
            Button(model.t("delete.cancel"), role: .cancel) {}
        } message: {
            Text(model.t("delete.body"))
        }
    }
}
