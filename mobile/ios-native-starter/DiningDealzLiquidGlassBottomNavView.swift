import UIKit
import React
import SwiftUI

private enum DiningDealzLiquidGlassBottomNavItem: String, CaseIterable, Identifiable {
  case home
  case map
  case profile
  case more

  var id: String { rawValue }
}

private struct DiningDealzLiquidGlassBottomNavDisplayItem: Identifiable {
  let item: DiningDealzLiquidGlassBottomNavItem
  let systemImageName: String
  let title: String

  var id: String {
    item.rawValue
  }
}

@objc(DiningDealzLiquidGlassBottomNavView)
final class DiningDealzLiquidGlassBottomNavView: UIView {
  @objc var onNavItemSelect: RCTDirectEventBlock?
  @objc var themeVariant: NSString = "default-dark" {
    didSet {
      updateRootView()
    }
  }

  @objc var activeItem: NSString = "map" {
    didSet {
      updateRootView()
    }
  }

  @objc var bottomInset: NSNumber = 0 {
    didSet {
      invalidateIntrinsicContentSize()
      updateRootView()
    }
  }

  @objc var homeLabel: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var homeSystemImage: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var includeHomeItem: Bool = false {
    didSet {
      updateRootView()
    }
  }

  @objc var mapLabel: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var mapSystemImage: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var moreOpen: Bool = false {
    didSet {
      updateRootView()
    }
  }

  @objc var moreLabel: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var moreSystemImage: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var profileLabel: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var profileSystemImage: NSString? {
    didSet {
      updateRootView()
    }
  }

  private let hostingController = UIHostingController(rootView: AnyView(EmptyView()))

  private var resolvedActiveItem: DiningDealzLiquidGlassBottomNavItem {
    let preferredItem = DiningDealzLiquidGlassBottomNavItem(rawValue: activeItem as String) ?? .map
    return resolvedItems.contains(where: { $0.item == preferredItem }) ? preferredItem : resolvedItems.first?.item ?? .map
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupView()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupView()
  }

  override var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: 52 + CGFloat(truncating: bottomInset))
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    clearLegacyHostingBackgroundsIfNeeded()
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.clearLegacyHostingBackgroundsIfNeeded()
    }
  }

  private func setupView() {
    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = false

    hostingController.view.backgroundColor = .clear
    hostingController.view.isOpaque = false
    hostingController.view.clipsToBounds = false
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(hostingController.view)

    NSLayoutConstraint.activate([
      hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingController.view.topAnchor.constraint(equalTo: topAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    updateRootView()
  }

  private func updateRootView() {
    let currentActiveItem = resolvedActiveItem
    let currentBottomInset = CGFloat(truncating: bottomInset)
    let currentItems = resolvedItems
    let currentMoreOpen = moreOpen
    let currentThemeVariant = resolvedThemeVariant

    hostingController.overrideUserInterfaceStyle = currentThemeVariant.interfaceStyle

    hostingController.rootView = AnyView(
      DiningDealzLegacyBottomNavContent(
        activeItem: currentActiveItem,
        bottomInset: currentBottomInset,
        items: currentItems,
        moreOpen: currentMoreOpen,
        themeVariant: currentThemeVariant,
        onSelect: handleSelection
      )
    )

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.clearLegacyHostingBackgroundsIfNeeded()
    }
  }

  private func clearLegacyHostingBackgroundsIfNeeded() {
    clearHostingBackgrounds(in: hostingController.view)
  }

  private func clearHostingBackgrounds(in view: UIView) {
    if view is UITabBar || view is UIVisualEffectView {
      return
    }

    view.backgroundColor = .clear
    view.isOpaque = false
    view.subviews.forEach(clearHostingBackgrounds)
  }

  private var resolvedThemeVariant: DiningDealzLiquidGlassThemeVariant {
    DiningDealzLiquidGlassThemeVariant(rawValue: themeVariant as String) ?? .defaultDark
  }

  private var resolvedItems: [DiningDealzLiquidGlassBottomNavDisplayItem] {
    let items = includeHomeItem
      ? DiningDealzLiquidGlassBottomNavItem.allCases
      : DiningDealzLiquidGlassBottomNavItem.allCases.filter { $0 != .home }

    return items.map { item in
      DiningDealzLiquidGlassBottomNavDisplayItem(
        item: item,
        systemImageName: resolvedSystemImage(for: item),
        title: resolvedTitle(for: item)
      )
    }
  }

  private func resolvedSystemImage(for item: DiningDealzLiquidGlassBottomNavItem) -> String {
    switch item {
    case .home:
      return (homeSystemImage as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "newspaper"
    case .map:
      return (mapSystemImage as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "map"
    case .profile:
      return (profileSystemImage as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "person.crop.circle"
    case .more:
      return (moreSystemImage as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "line.3.horizontal"
    }
  }

  private func resolvedTitle(for item: DiningDealzLiquidGlassBottomNavItem) -> String {
    switch item {
    case .home:
      return (homeLabel as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "Feed"
    case .map:
      return (mapLabel as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "Map"
    case .profile:
      return (profileLabel as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "Profile"
    case .more:
      return (moreLabel as String?)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "More"
    }
  }

  private func handleSelection(_ item: DiningDealzLiquidGlassBottomNavItem) {
    activeItem = item.rawValue as NSString
    onNavItemSelect?(["item": item.rawValue])
  }
}

private enum DiningDealzLiquidGlassThemeVariant: String {
  case defaultDark = "default-dark"
  case mapDark = "map-dark"
  case mapLight = "map-light"

  var interfaceStyle: UIUserInterfaceStyle {
    switch self {
    case .mapLight:
      return .light
    case .defaultDark, .mapDark:
      return .dark
    }
  }
}

private extension String {
  var nonEmpty: String? {
    isEmpty ? nil : self
  }
}

// MARK: — iOS 26 Native TabView (system liquid glass)

@available(iOS 26.0, *)
private struct DiningDealzLiquidGlassBottomNavContent: View {
  let activeItem: DiningDealzLiquidGlassBottomNavItem
  let bottomInset: CGFloat
  let items: [DiningDealzLiquidGlassBottomNavDisplayItem]
  let moreOpen: Bool
  let themeVariant: DiningDealzLiquidGlassThemeVariant
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  private var selectedTab: DiningDealzLiquidGlassBottomNavItem {
    moreOpen ? .more : activeItem
  }

  private var accentColor: Color {
    Color(red: 1, green: 0.3, blue: 0.38)
  }

  var body: some View {
    TabView(selection: Binding(
      get: { selectedTab },
      set: { onSelect($0) }
    )) {
      ForEach(items) { displayItem in
        Tab(displayItem.title, systemImage: displayItem.systemImageName, value: displayItem.item) {
          Color.clear
        }
      }
    }
    .background(Color.clear)
    .tabViewStyle(.tabBarOnly)
    .tint(accentColor)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
  }
}

// MARK: — Legacy Fallback (pre-iOS 26)

private struct DiningDealzLegacyBottomNavContent: View {
  let activeItem: DiningDealzLiquidGlassBottomNavItem
  let bottomInset: CGFloat
  let items: [DiningDealzLiquidGlassBottomNavDisplayItem]
  let moreOpen: Bool
  let themeVariant: DiningDealzLiquidGlassThemeVariant
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  private var displayedActiveItem: DiningDealzLiquidGlassBottomNavItem {
    moreOpen ? .more : activeItem
  }

  private var inactiveForegroundColor: Color {
    switch themeVariant {
    case .mapLight:
      return Color(red: 0.14, green: 0.18, blue: 0.25).opacity(0.82)
    case .defaultDark, .mapDark:
      return Color.white
    }
  }

  private var selectorFillColor: Color {
    switch themeVariant {
    case .mapLight:
      return Color.white.opacity(displayedActiveItem == .map ? 0.5 : 0.22)
    case .defaultDark, .mapDark:
      return displayedActiveItem == .map ? Color.white.opacity(0.22) : Color.white.opacity(0.12)
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      HStack(spacing: 6) {
        ForEach(items) { displayItem in
          Button {
            onSelect(displayItem.item)
          } label: {
            VStack(spacing: 2) {
              Image(systemName: displayItem.systemImageName)
                .font(.system(size: 16, weight: displayItem.item == displayedActiveItem ? .bold : .semibold))
                .frame(height: 18)
              Text(displayItem.title)
                .font(.system(size: 10, weight: displayItem.item == displayedActiveItem ? .bold : .medium))
                .lineLimit(1)
            }
            .foregroundStyle(displayItem.item == displayedActiveItem ? Color(red: 1, green: 0.3, blue: 0.38) : inactiveForegroundColor)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(
              displayItem.item == displayedActiveItem
                ? Capsule().fill(selectorFillColor)
                : nil
            )
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 7)
      .padding(.vertical, 7)
      .background(
        Capsule()
          .fill(.ultraThinMaterial)
      )
      .padding(.horizontal, 12)
      .padding(.bottom, max(bottomInset * 0.32, 4))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .background(Color.clear)
  }
}
