import UIKit
import React
import SwiftUI

private enum DiningDealzLiquidGlassBottomNavItem: String, CaseIterable, Identifiable {
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
    DiningDealzLiquidGlassBottomNavItem(rawValue: activeItem as String) ?? .map
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
    CGSize(width: UIView.noIntrinsicMetric, height: 72 + CGFloat(truncating: bottomInset))
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
    DiningDealzLiquidGlassBottomNavItem.allCases.map { item in
      DiningDealzLiquidGlassBottomNavDisplayItem(
        item: item,
        systemImageName: resolvedSystemImage(for: item),
        title: resolvedTitle(for: item)
      )
    }
  }

  private func resolvedSystemImage(for item: DiningDealzLiquidGlassBottomNavItem) -> String {
    switch item {
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

  private let containerSpacing: CGFloat = 18
  private let itemSpacing: CGFloat = 8
  private let itemHeight: CGFloat = 52
  private let horizontalInset: CGFloat = 6
  private let selectorHeight: CGFloat = 62
  private let selectorVerticalOffset: CGFloat = 0
  private let selectorWidthRatio: CGFloat = 0.8

  private var selectorLift: CGFloat {
    -4
  }
  private let selectorHorizontalInset: CGFloat = 4

  private var containerBottomOffset: CGFloat {
    min(max(bottomInset * 0.58, 8), 18)
  }

  private var displayedActiveItem: DiningDealzLiquidGlassBottomNavItem {
    hoveredItem ?? (moreOpen ? .more : activeItem)
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)

      GeometryReader { geometry in
        let metrics = layoutMetrics(totalWidth: geometry.size.width)

        ZStack(alignment: .leading) {
          GlassEffectContainer(spacing: containerSpacing) {
            ZStack(alignment: .leading) {
              Capsule(style: .continuous)
                .fill(.clear)
                .glassEffect(.regular.interactive(false), in: Capsule(style: .continuous))
                .frame(height: itemHeight + (horizontalInset * 2))
                .opacity(0.78)

              Capsule(style: .continuous)
                .fill(.clear)
                .glassEffect(.regular.interactive(), in: Capsule(style: .continuous))
                .frame(width: max(0, metrics.itemWidth * selectorWidthRatio), height: selectorHeight)
                .offset(x: indicatorOffsetX(for: metrics) + ((metrics.itemWidth - max(0, metrics.itemWidth * selectorWidthRatio)) / 2))
                .offset(y: selectorVerticalOffset + selectorLift)
                .opacity(0.58)
                .shadow(color: .black.opacity(0.08), radius: 10, x: 0, y: 2)
                .animation(.spring(response: 0.22, dampingFraction: 0.84), value: displayedActiveItem)
                .animation(.interactiveSpring(response: 0.18, dampingFraction: 0.86), value: dragLocationX)
            }
            .frame(height: itemHeight + (horizontalInset * 2))
          }

          ZStack(alignment: .leading) {
            if let selectedDisplayItem = displayItem(for: displayedActiveItem) {
              navItemContent(selectedDisplayItem, isActive: true)
                .frame(width: metrics.itemWidth, height: itemHeight)
                .offset(x: indicatorOffsetX(for: metrics))
                .offset(y: selectorVerticalOffset + selectorLift)
                .zIndex(2)
                .animation(.spring(response: 0.22, dampingFraction: 0.84), value: displayedActiveItem)
                .animation(.interactiveSpring(response: 0.18, dampingFraction: 0.86), value: dragLocationX)
            }

            HStack(spacing: itemSpacing) {
              ForEach(items) { displayItem in
                navItemContent(displayItem, isActive: false)
                  .frame(width: metrics.itemWidth, height: itemHeight)
                  .contentShape(Rectangle())
                  .accessibilityElement(children: .ignore)
                  .accessibilityLabel(Text(displayItem.title))
                  .opacity(displayItem.item == displayedActiveItem ? 0 : 1)
              }
            }
            .padding(.horizontal, horizontalInset)
            .padding(.vertical, horizontalInset)
          }
          .frame(height: itemHeight + (horizontalInset * 2))
          .contentShape(Rectangle())
          .gesture(
            DragGesture(minimumDistance: 0)
              .onChanged { value in
                dragLocationX = value.location.x
                hoveredItem = nearestItem(at: value.location.x, totalWidth: geometry.size.width)
              }
              .onEnded { value in
                let finalItem = nearestItem(at: value.location.x, totalWidth: geometry.size.width) ?? hoveredItem
                dragLocationX = nil
                hoveredItem = nil
                if let finalItem {
                  onSelect(finalItem)
                }
              }
          )
        }
      }
      .frame(height: itemHeight + (horizontalInset * 2))
      .padding(.horizontal, 12)
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
        .font(.system(size: 16, weight: .semibold))
        .frame(height: 18)
      Text(displayItem.title)
        .font(.system(size: 10, weight: .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .allowsTightening(true)
    }
    .foregroundStyle(.primary)
    .opacity(isActive ? 1 : 0.88)
  }

  private func indicatorOffsetX(for metrics: DiningDealzLiquidGlassBottomNavLayoutMetrics) -> CGFloat {
    guard let dragLocationX else {
      return metrics.offsetX(for: displayedActiveItem)
    }

    return metrics.clampedOffsetX(for: dragLocationX)
  }

  private func displayItem(for item: DiningDealzLiquidGlassBottomNavItem) -> DiningDealzLiquidGlassBottomNavDisplayItem? {
    items.first(where: { $0.item == item })
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
      itemSpacing: itemSpacing,
      leadingInset: horizontalInset,
      totalWidth: totalWidth
    )
  }
}

private struct DiningDealzLiquidGlassBottomNavLayoutMetrics {
  let itemCount: Int
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
    switch item {
    case .map:
      return offsetX(for: 0)
    case .profile:
      return offsetX(for: 1)
    case .more:
      return offsetX(for: 2)
    }
  }

  func offsetX(for index: Int) -> CGFloat {
    leadingInset + (CGFloat(index) * (itemWidth + itemSpacing))
  }

  func clampedOffsetX(for dragLocationX: CGFloat) -> CGFloat {
    let centeredOffset = dragLocationX - (itemWidth / 2)
    let minimumOffset = offsetX(for: 0)
    let maximumOffset = offsetX(for: max(itemCount - 1, 0))
    return min(max(centeredOffset, minimumOffset), maximumOffset)
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