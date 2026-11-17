// The frame of every screen: the header (wordmark and language), the one-line demo notice, the content,
// and the inverted bottom block with the screen's one main action above the "Leaving your device"
// count row. The block follows the keyboard; while a text field has focus the count row shrinks to the
// number. When the block would cover more than 40 % of the screen, its actions scroll with the content
// and only the count row stays pinned.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

enum BlockMode { case compact, standard, decision }

struct Screen<Content: View, Actions: View>: View {
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    var mode: BlockMode = .standard
    var scrollTo: Binding<String?>? = nil
    @ViewBuilder let content: Content
    @ViewBuilder let actions: Actions

    @State private var fullHeight: CGFloat = 874
    @State private var actionsHeight: CGFloat = 0
    @State private var countHeight: CGFloat = 0
    @State private var typing = false

    private var compactHeight: Bool { fullHeight < 700 }
    /// Actions plus count row would cover more than 40 % of the screen.
    private var tall: Bool { mode != .compact && actionsHeight + countHeight + 34 > fullHeight * 0.4 }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    AppHeader()
                    DemoLine()
                    VStack(alignment: .leading, spacing: theme.space("md")) { content }
                        .padding(.top, theme.space("md"))
                        .padding(.bottom, theme.space("xl"))
                        .padding(.horizontal, theme.gutter)
                    if tall && !typing {
                        blockActions
                            .padding(.bottom, theme.space("md"))
                            .background(UnevenRoundedRectangle(topLeadingRadius: theme.radius("block"), topTrailingRadius: theme.radius("block"))
                                .fill(theme.block))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: scrollTo?.wrappedValue) { _, target in
                guard let target else { return }
                withAnimation(theme.curve("standard", duration: "medium")) { proxy.scrollTo(target, anchor: .center) }
                scrollTo?.wrappedValue = nil
            }
        }
        .background(theme.ground)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if mode != .compact && (!tall || typing) {
                    blockActions
                }
                // Pinned like a system bar: its text stops growing at the first accessibility size and the
                // subline is left to VoiceOver there, so the content keeps most of the screen.
                CountRow(separated: mode != .compact && (!tall || typing), numberOnly: typing,
                         compactHeight: compactHeight || dynamicType.isAccessibilitySize)
                    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { countHeight = $0 }
            }
            .background(UnevenRoundedRectangle(topLeadingRadius: theme.radius("block"), topTrailingRadius: theme.radius("block"))
                .fill(theme.block)
                .ignoresSafeArea(edges: .bottom))
            .environment(\.surface, .block)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("bottom.block")
        }
        .background {
            Color.clear.ignoresSafeArea()
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { fullHeight = $0 }
        }
        .environment(\.compactHeight, compactHeight)
        .toolbar(.hidden, for: .navigationBar)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in typing = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in typing = false }
    }

    private var blockActions: some View {
        VStack(alignment: .leading, spacing: 8) { actions }
            .padding(.top, 14)
            .padding(.horizontal, 12)
            .padding(.bottom, 4)
            .environment(\.surface, .block)
            .environment(\.compactHeight, compactHeight)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { actionsHeight = $0 }
    }
}

extension Screen where Actions == EmptyView {
    init(mode: BlockMode = .compact, scrollTo: Binding<String?>? = nil, @ViewBuilder content: () -> Content) {
        self.init(mode: mode, scrollTo: scrollTo, content: content) { EmptyView() }
    }
}

// MARK: - Header and demo line

private let shortLocaleNames: [AppLocale: String] = [.en: "EN", .es: "ES", .ko: "한국어"]

struct AppHeader: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 8) {
            Button { model.goHome() } label: {
                Text(verbatim: "Silhouette")
                    .type(.wordmark)
                    .foregroundStyle(theme.ink)
                    .padding(.bottom, 5)
                    .frame(minHeight: theme.minTapTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel(model.t("nav.home"))
            .accessibilityIdentifier("nav.home")
            // Display type stops growing at the token cap; the Large Content Viewer shows it enlarged.
            .accessibilityShowsLargeContentViewer { Text(verbatim: "Silhouette") }
            Spacer(minLength: 8)
            Button { model.sheet = .language } label: {
                Text(verbatim: shortLocaleNames[model.locale] ?? model.locale.rawValue.uppercased())
                    .type(.control)
                    .foregroundStyle(theme.ink)
                    .frame(minWidth: theme.minTapTarget, minHeight: theme.minTapTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel(model.t("nav.language"))
            .accessibilityValue(model.locale.nativeName)
            .accessibilityIdentifier("language.menu")
        }
        .frame(minHeight: theme.size("headerHeight"))
        .padding(.leading, theme.gutter)
        .padding(.trailing, theme.gutter - 12)
    }
}

/// The one-line demo notice (12.5 muted) with "More", which opens the demo-rules sheet.
struct DemoLine: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        let info = model.bundle.packInfo
        if info.isDemo || info.isDraft {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                // A draft pack says so on every screen, with the date its sources were read.
                Text(info.isDraft ? model.t("pack.draft.short", ["date": model.draftDate]) : model.t("demo.short"))
                    .type(.caption)
                    .foregroundStyle(theme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Button { model.sheet = .demo } label: {
                    Text(model.t("demo.more"))
                        .type(.caption)
                        .underline()
                        .foregroundStyle(theme.ink)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -12)
                .accessibilityIdentifier("demo.more")
                Spacer(minLength: 0)
            }
            .frame(minHeight: theme.size("demoLineHeight"))
            .padding(.horizontal, theme.gutter)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(info.isDraft ? model.t("pack.draft.title") : model.t("demo.title"))
            .accessibilityIdentifier("demo.banner")
        }
    }
}

// MARK: - Count row

/// The count, "Leaving your device" with its subline, and Details (the record sheet).
struct CountRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    /// A hairline above it, under the actions.
    var separated = false
    /// While typing: the number and the title only.
    var numberOnly = false
    var compactHeight = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            CountStamp(count: model.sentCount)
                .accessibilityHidden(true)
                .accessibilityShowsLargeContentViewer {
                    Text(verbatim: "\(model.number(Double(model.sentCount))) · \(model.countSubline)")
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(model.t("leaving.title"))
                    .type(.control)
                    .foregroundStyle(theme.onBlock)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityShowsLargeContentViewer()
                if !numberOnly && !compactHeight {
                    Text(model.countSubline)
                        .type(.caption)
                        .foregroundStyle(theme.onBlockMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("leaving.status")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !numberOnly {
                Button(model.t("leaving.details")) { model.sheet = .record }
                    .buttonStyle(OutlineStyle())
                    .accessibilityHint(model.t("leaving.title"))
                    .accessibilityIdentifier("leaving.details")
            }
        }
        .padding(.top, 10)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .overlay(alignment: .top) {
            if separated { Rectangle().fill(theme.blockLine).frame(height: 1).padding(.horizontal, 12) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("leaving.bar")
        .overlay(alignment: .bottomLeading) {
            // Compact height hides the subline; the status stays available to VoiceOver.
            if compactHeight || numberOnly {
                Text(model.countSubline).font(.caption2).opacity(0.001).frame(width: 1, height: 1).clipped()
                    .accessibilityIdentifier("leaving.status")
            }
        }
    }
}
