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

    hostingController.rootView = AnyView(
      Group {
        if #available(iOS 26.0, *) {
          DiningDealzLiquidGlassBottomNavContent(
            activeItem: currentActiveItem,
            bottomInset: currentBottomInset,
            items: currentItems,
            moreOpen: currentMoreOpen,
            onSelect: handleSelection
          )
        } else {
          DiningDealzLegacyBottomNavContent(
            activeItem: currentActiveItem,
            bottomInset: currentBottomInset,
            items: currentItems,
            moreOpen: currentMoreOpen,
            onSelect: handleSelection
          )
        }
      }
    )
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

private extension String {
  var nonEmpty: String? {
    isEmpty ? nil : self
  }
}

@available(iOS 26.0, *)
private struct DiningDealzLiquidGlassBottomNavContent: View {
  let activeItem: DiningDealzLiquidGlassBottomNavItem
  let bottomInset: CGFloat
  let items: [DiningDealzLiquidGlassBottomNavDisplayItem]
  let moreOpen: Bool
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  @State private var hoveredItem: DiningDealzLiquidGlassBottomNavItem?
  @State private var dragLocationX: CGFloat?
  @State private var isDragging = false
  @State private var isContainerHovered = false

  private let containerSpacing: CGFloat = 10
  private let itemSpacing: CGFloat = 8
  private let itemHeight: CGFloat = 50
  private let horizontalInset: CGFloat = 7
  private let outerHorizontalPadding: CGFloat = 12
  private let selectorVerticalOffset: CGFloat = 0
  private let restingSelectorWidthRatio: CGFloat = 0.96
  private let draggingSelectorWidthRatio: CGFloat = 1.42
  private let restingSelectorExtraWidth: CGFloat = 0
  private let draggingSelectorExtraWidth: CGFloat = 30
  private let draggingSelectorExtraHeight: CGFloat = 16
  private let selectorOverflowAllowance: CGFloat = 14

  private var containerHeight: CGFloat {
    itemHeight + (horizontalInset * 2)
  }

  private var selectorHeight: CGFloat {
    isDragging ? containerHeight + draggingSelectorExtraHeight : containerHeight - 4
  }

  private var selectorLift: CGFloat {
    0
  }

  private var containerBottomOffset: CGFloat {
    items.contains(where: { $0.item == .home }) ? 0 : min(max(bottomInset * 0.32, 4), 11)
  }

  private var selectedItem: DiningDealzLiquidGlassBottomNavItem {
    moreOpen ? .more : activeItem
  }

  private var isContainerActive: Bool {
    isContainerHovered || hoveredItem != nil
  }

  private var isSelectorActive: Bool {
    hoveredItem != nil || isContainerHovered
  }

  private var visuallyActiveItem: DiningDealzLiquidGlassBottomNavItem {
    hoveredItem ?? selectedItem
  }

  private var liquidGlassTint: Color {
    Color(red: 0.62, green: 0.36, blue: 0.29).opacity(0.18)
  }

  private var selectorTint: Color {
    Color.white.opacity(0.01)
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)

      GeometryReader { geometry in
        let metrics = layoutMetrics(totalWidth: geometry.size.width)
        let selectorWidth = selectorWidth(for: metrics)

        ZStack(alignment: .leading) {
          GlassEffectContainer(spacing: containerSpacing) {
            Color.clear
              .frame(height: containerHeight)
              .glassEffect(.regular.tint(liquidGlassTint).interactive(false), in: Capsule(style: .continuous))
          }
          .frame(height: containerHeight)
          .zIndex(0)

          GlassEffectContainer(spacing: containerSpacing) {
            if isDragging {
              Color.clear
                .frame(width: selectorWidth, height: selectorHeight)
                .glassEffect(.regular.interactive(), in: Capsule(style: .continuous))
                .overlay(
                  Capsule(style: .continuous)
                    .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
                )
            } else {
              Color.clear
                .frame(width: selectorWidth, height: selectorHeight)
                .glassEffect(.regular.tint(selectorTint).interactive(), in: Capsule(style: .continuous))
                .overlay(
                  Capsule(style: .continuous)
                    .strokeBorder(Color.white.opacity(0.1), lineWidth: 1)
                )
            }
          }
          .frame(width: selectorWidth, height: selectorHeight)
          .offset(x: selectorOffsetX(for: metrics, selectorWidth: selectorWidth, totalWidth: geometry.size.width))
          .offset(y: selectorVerticalOffset + selectorLift)
          .zIndex(1)
          .animation(.interactiveSpring(response: 0.24, dampingFraction: 0.82, blendDuration: 0.12), value: selectedItem)
          .animation(.interactiveSpring(response: 0.2, dampingFraction: 0.78, blendDuration: 0.12), value: hoveredItem)
          .animation(.interactiveSpring(response: 0.18, dampingFraction: 0.76, blendDuration: 0.12), value: dragLocationX)
          .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.8, blendDuration: 0.12), value: isDragging)
          .animation(.interactiveSpring(response: 0.2, dampingFraction: 0.82, blendDuration: 0.12), value: isSelectorActive)

          ZStack(alignment: .leading) {
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
          }
          .frame(height: itemHeight + (horizontalInset * 2))
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
                let finalItem = nearestItem(at: value.location.x, totalWidth: geometry.size.width) ?? hoveredItem
                dragLocationX = nil
                isDragging = false
                hoveredItem = nil
                if let finalItem {
                  onSelect(finalItem)
                }
              }
          )
        }
        .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.82, blendDuration: 0.12), value: hoveredItem)
        .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.82, blendDuration: 0.12), value: isContainerHovered)
        .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.78, blendDuration: 0.12), value: isDragging)
        .onHover { hovering in
          isContainerHovered = hovering
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
        .font(.system(size: 16, weight: isActive ? .bold : .semibold))
        .frame(height: 18)
      Text(displayItem.title)
        .font(.system(size: 10, weight: isActive ? .bold : .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .allowsTightening(true)
    }
    .foregroundStyle(isActive ? Color(red: 1, green: 0.04, blue: 0.06) : Color.white.opacity(0.92))
    .shadow(color: .black.opacity(isActive ? 0.18 : 0.28), radius: 1, x: 0, y: 1)
    .opacity(isActive ? 1 : 0.76)
    .scaleEffect(isActive ? 1.07 : 1)
    .animation(.spring(response: 0.2, dampingFraction: 0.82), value: isActive)
  }

  private func indicatorOffsetX(for metrics: DiningDealzLiquidGlassBottomNavLayoutMetrics) -> CGFloat {
    metrics.offsetX(for: visuallyActiveItem)
  }

  private func selectorWidth(for metrics: DiningDealzLiquidGlassBottomNavLayoutMetrics) -> CGFloat {
    let ratio = isDragging ? draggingSelectorWidthRatio : restingSelectorWidthRatio
    let extraWidth = isDragging ? draggingSelectorExtraWidth : restingSelectorExtraWidth
    return max(0, max(metrics.itemWidth * ratio, metrics.itemWidth + extraWidth))
  }

  private func selectorOffsetX(
    for metrics: DiningDealzLiquidGlassBottomNavLayoutMetrics,
    selectorWidth: CGFloat,
    totalWidth: CGFloat
  ) -> CGFloat {
    if let dragLocationX {
      let minX = metrics.leadingInset - selectorOverflowAllowance
      let maxX = max(minX, totalWidth - metrics.leadingInset - selectorWidth + selectorOverflowAllowance)
      return min(max(dragLocationX - (selectorWidth / 2), minX), maxX)
    }

    return indicatorOffsetX(for: metrics) + ((metrics.itemWidth - selectorWidth) / 2)
  }

  private func nearestItem(at x: CGFloat, totalWidth: CGFloat) -> DiningDealzLiquidGlassBottomNavItem? {
    let metrics = layoutMetrics(totalWidth: totalWidth)
    guard metrics.itemWidth > 0, !items.isEmpty else {
      return nil
    }

    let clampedX = min(max(x, 0), totalWidth)
    let nearestIndex = items.enumerated().min { lhs, rhs in
      abs(metrics.centerX(for: lhs.offset) - clampedX) < abs(metrics.centerX(for: rhs.offset) - clampedX)
    }?.offset

    guard let nearestIndex else {
      return nil
    }
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

private struct DiningDealzLiquidGlassBottomNavLayoutMetrics {
  let itemCount: Int
  let items: [DiningDealzLiquidGlassBottomNavDisplayItem]
  let itemSpacing: CGFloat
  let leadingInset: CGFloat
  let totalWidth: CGFloat

  var itemWidth: CGFloat {
    guard itemCount > 0 else {
      return 0
    }

    let availableWidth = totalWidth - (leadingInset * 2) - (itemSpacing * CGFloat(max(itemCount - 1, 0)))
    return max(0, availableWidth / CGFloat(itemCount))
  }

  func centerX(for index: Int) -> CGFloat {
    offsetX(for: index) + (itemWidth / 2)
  }

  func offsetX(for item: DiningDealzLiquidGlassBottomNavItem) -> CGFloat {
    guard let index = items.firstIndex(where: { $0.item == item }) else {
      return offsetX(for: 0)
    }

    return offsetX(for: index)
  }

  func offsetX(for index: Int) -> CGFloat {
    leadingInset + (CGFloat(index) * (itemWidth + itemSpacing))
  }

}

private struct DiningDealzLegacyBottomNavContent: View {
  let activeItem: DiningDealzLiquidGlassBottomNavItem
  let bottomInset: CGFloat
  let items: [DiningDealzLiquidGlassBottomNavDisplayItem]
  let moreOpen: Bool
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  private var displayedActiveItem: DiningDealzLiquidGlassBottomNavItem {
    moreOpen ? .more : activeItem
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      HStack(spacing: 12) {
        ForEach(items) { displayItem in
          Button(action: {
            onSelect(displayItem.item)
          }) {
            VStack(spacing: 4) {
              Image(systemName: displayItem.systemImageName)
                .font(.system(size: 18, weight: .semibold))
                .frame(height: 20)
              Text(displayItem.title)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
          }
          .foregroundStyle(Color.white)
          .background(
            Capsule(style: .continuous)
              .fill(displayedActiveItem == displayItem.item ? Color.white.opacity(0.22) : Color.white.opacity(0.12))
          )
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 2)
      .padding(.bottom, max(5, bottomInset * 0.2))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .background(Color.clear)
  }
}
