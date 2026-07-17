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
    CGSize(width: UIView.noIntrinsicMetric, height: max(90, 76 + CGFloat(truncating: bottomInset)))
  }

  private func setupView() {
    backgroundColor = .clear

    hostingController.view.backgroundColor = .clear
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
      Group {
        if #available(iOS 26.0, *) {
          DiningDealzLiquidGlassBottomNavContent(
            activeItem: currentActiveItem,
            bottomInset: currentBottomInset,
            items: currentItems,
            moreOpen: currentMoreOpen,
            themeVariant: currentThemeVariant,
            onSelect: handleSelection
          )
        } else {
          DiningDealzLegacyBottomNavContent(
            activeItem: currentActiveItem,
            bottomInset: currentBottomInset,
            items: currentItems,
            moreOpen: currentMoreOpen,
            themeVariant: currentThemeVariant,
            onSelect: handleSelection
          )
        }
      }
    )
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

// MARK: — iOS 26 Liquid Glass Nav (Apple-native pattern)

@available(iOS 26.0, *)
private struct DiningDealzLiquidGlassBottomNavContent: View {
  let activeItem: DiningDealzLiquidGlassBottomNavItem
  let bottomInset: CGFloat
  let items: [DiningDealzLiquidGlassBottomNavDisplayItem]
  let moreOpen: Bool
  let themeVariant: DiningDealzLiquidGlassThemeVariant
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  @State private var hoveredItem: DiningDealzLiquidGlassBottomNavItem?
  @State private var dragLocationX: CGFloat?
  @State private var isDragging = false

  private let itemSpacing: CGFloat = 8
  private let itemHeight: CGFloat = 50
  private let horizontalInset: CGFloat = 7
  private let outerHorizontalPadding: CGFloat = 12
  private let selectorOverflowAllowance: CGFloat = 20

  private var containerHeight: CGFloat {
    itemHeight + (horizontalInset * 2)
  }

  private var containerBottomOffset: CGFloat {
    items.contains(where: { $0.item == .home }) ? 0 : min(max(bottomInset * 0.32, 4), 11)
  }

  private var selectedItem: DiningDealzLiquidGlassBottomNavItem {
    moreOpen ? .more : activeItem
  }

  private var visuallyActiveItem: DiningDealzLiquidGlassBottomNavItem {
    hoveredItem ?? selectedItem
  }

  private var activeForegroundColor: Color {
    Color(red: 1, green: 0.3, blue: 0.38)
  }

  private var inactiveForegroundColor: Color {
    switch themeVariant {
    case .mapLight:
      return Color(red: 0.14, green: 0.18, blue: 0.25).opacity(0.88)
    case .defaultDark, .mapDark:
      return Color.white.opacity(0.92)
    }
  }

  // Apple Music-style bouncy spring — lower damping gives the fluid overshoot
  private var tabSpring: Animation {
    .spring(response: 0.4, dampingFraction: 0.72, blendDuration: 0)
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)

      GeometryReader { geometry in
        let metrics = layoutMetrics(totalWidth: geometry.size.width)
        // Selector is wider than a single item — creates the bubble/oval shape
        let selectorWidth = metrics.itemWidth + (horizontalInset * 2) + 12
        let selectorHeight = containerHeight + 6

        ZStack(alignment: .leading) {
          // Container glass — non-interactive backdrop capsule
          GlassEffectContainer {
            Color.clear
              .frame(height: containerHeight)
              .glassEffect(.regular.interactive(false), in: Capsule(style: .continuous))
          }
          .frame(height: containerHeight)
          .zIndex(0)

          // Selector glass — interactive bubble that floats over the active tab
          GlassEffectContainer {
            Color.clear
              .frame(width: selectorWidth, height: selectorHeight)
              .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: selectorHeight / 2, style: .continuous))
          }
          .frame(width: selectorWidth, height: selectorHeight)
          .offset(
            x: selectorOffsetX(for: metrics, selectorWidth: selectorWidth, totalWidth: geometry.size.width),
            y: -((selectorHeight - containerHeight) / 2)
          )
          .scaleEffect(isDragging ? 1.05 : 1.0)
          .zIndex(1)
          .animation(tabSpring, value: visuallyActiveItem)
          .animation(tabSpring, value: dragLocationX)
          .animation(tabSpring, value: isDragging)

          // Tab item labels
          HStack(spacing: itemSpacing) {
            ForEach(items) { displayItem in
              navItemContent(displayItem, isActive: displayItem.item == visuallyActiveItem)
                .frame(width: metrics.itemWidth, height: itemHeight)
                .contentShape(Rectangle())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(displayItem.title))
            }
          }
          .padding(.horizontal, horizontalInset)
          .padding(.vertical, horizontalInset)
          .frame(height: containerHeight)
          .contentShape(Rectangle())
          .zIndex(2)
          .gesture(
            DragGesture(minimumDistance: 0)
              .onChanged { value in
                dragLocationX = value.location.x
                isDragging = true
                let nextItem = nearestItem(at: value.location.x, totalWidth: geometry.size.width)
                if hoveredItem != nextItem {
                  hoveredItem = nextItem
                }
              }
              .onEnded { value in
                let finalItem = nearestItem(at: value.predictedEndLocation.x, totalWidth: geometry.size.width)
                  ?? nearestItem(at: value.location.x, totalWidth: geometry.size.width)
                  ?? hoveredItem
                dragLocationX = nil
                isDragging = false
                hoveredItem = nil
                if let finalItem {
                  onSelect(finalItem)
                }
              }
          )
        }
      }
      .frame(height: containerHeight)
      .padding(.horizontal, outerHorizontalPadding)
      .padding(.top, 2)
      .padding(.bottom, 0)
      .offset(y: containerBottomOffset)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .background(Color.clear)
  }

  @ViewBuilder
  private func navItemContent(_ displayItem: DiningDealzLiquidGlassBottomNavDisplayItem, isActive: Bool) -> some View {
    VStack(spacing: 2) {
      Image(systemName: displayItem.systemImageName)
        .font(.system(size: isActive ? 20 : 16, weight: isActive ? .bold : .semibold))
        .symbolEffect(.bounce, value: isActive)
        .frame(height: 22)
      Text(displayItem.title)
        .font(.system(size: isActive ? 11 : 10, weight: isActive ? .bold : .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .allowsTightening(true)
    }
    .foregroundStyle(isActive ? activeForegroundColor : inactiveForegroundColor)
    .opacity(isActive ? 1 : 0.65)
    .scaleEffect(isActive ? 1.18 : 0.92)
    .animation(tabSpring, value: isActive)
  }

  // MARK: — Layout

  private func selectorOffsetX(
    for metrics: DiningDealzLiquidGlassBottomNavLayoutMetrics,
    selectorWidth: CGFloat,
    totalWidth: CGFloat
  ) -> CGFloat {
    if let dragLocationX {
      // During drag: track finger position with rubber-band at edges
      let minX: CGFloat = 0
      let maxX = max(0, totalWidth - (outerHorizontalPadding * 2) - selectorWidth)
      let rawX = dragLocationX - (selectorWidth / 2)
      return rubberBandClamp(rawX, min: minX, max: maxX)
    }
    // At rest: center on the active item
    let itemCenterX = metrics.centerX(for: visuallyActiveItem)
    return itemCenterX - (selectorWidth / 2)
  }

  private func rubberBandClamp(_ value: CGFloat, min minValue: CGFloat, max maxValue: CGFloat) -> CGFloat {
    if value < minValue {
      let overshoot = minValue - value
      return minValue - rubberBandDistance(overshoot)
    }
    if value > maxValue {
      let overshoot = value - maxValue
      return maxValue + rubberBandDistance(overshoot)
    }
    return value
  }

  private func rubberBandDistance(_ distance: CGFloat) -> CGFloat {
    // Apple's rubber-band formula: diminishing returns past the boundary
    let coefficient: CGFloat = 0.55
    let dimension: CGFloat = max(selectorOverflowAllowance, 1)
    return (1 - (1 / ((distance * coefficient / dimension) + 1))) * dimension
  }

  private func nearestItem(at x: CGFloat, totalWidth: CGFloat) -> DiningDealzLiquidGlassBottomNavItem? {
    let metrics = layoutMetrics(totalWidth: totalWidth)
    guard metrics.itemWidth > 0, !items.isEmpty else { return nil }
    let clampedX = min(max(x, 0), totalWidth)
    let nearestIndex = items.enumerated().min { lhs, rhs in
      abs(metrics.centerX(for: lhs.offset) - clampedX) < abs(metrics.centerX(for: rhs.offset) - clampedX)
    }?.offset
    guard let nearestIndex else { return nil }
    return items[nearestIndex].item
  }

  private func layoutMetrics(totalWidth: CGFloat) -> DiningDealzLiquidGlassBottomNavLayoutMetrics {
    DiningDealzLiquidGlassBottomNavLayoutMetrics(
      itemCount: items.count,
      items: items,
      itemSpacing: itemSpacing,
      leadingInset: horizontalInset,
      totalWidth: totalWidth
    )
  }
}

// MARK: — Layout Metrics

private struct DiningDealzLiquidGlassBottomNavLayoutMetrics {
  let itemCount: Int
  let items: [DiningDealzLiquidGlassBottomNavDisplayItem]
  let itemSpacing: CGFloat
  let leadingInset: CGFloat
  let totalWidth: CGFloat

  var itemWidth: CGFloat {
    guard itemCount > 0 else { return 0 }
    let availableWidth = totalWidth - (leadingInset * 2) - (itemSpacing * CGFloat(max(itemCount - 1, 0)))
    return max(0, availableWidth / CGFloat(itemCount))
  }

  func centerX(for index: Int) -> CGFloat {
    leadingInset + (CGFloat(index) * (itemWidth + itemSpacing)) + (itemWidth / 2)
  }

  func centerX(for item: DiningDealzLiquidGlassBottomNavItem) -> CGFloat {
    guard let index = items.firstIndex(where: { $0.item == item }) else {
      return centerX(for: 0)
    }
    return centerX(for: index)
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
