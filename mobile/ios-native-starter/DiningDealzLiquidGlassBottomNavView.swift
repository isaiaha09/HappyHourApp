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

//
// MARK: — APPLE LIQUID GLASS MODIFIER
//

extension View {
    func appleLiquidGlass(
        shape: some Shape,
        theme: DiningDealzLiquidGlassThemeVariant,
        isActive: Bool,
        dragIntensity: CGFloat
    ) -> some View {
        self
            .glassEffect(.regular.interactive(), in: shape)

            .overlay(
                shape.fill(
                    LinearGradient(
                        colors: theme == .mapLight
                            ? [
                                Color.white.opacity(0.18 + dragIntensity * 0.1),
                                Color.white.opacity(0.06)
                              ]
                            : [
                                Color.white.opacity(0.08 + dragIntensity * 0.1),
                                Color.white.opacity(0.02)
                              ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            )

            .overlay(
                shape.stroke(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(isActive ? 0.32 : 0.18),
                            Color.white.opacity(0.06)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: isActive ? 1.4 : 1
                )
            )

            .overlay(
                shape.stroke(Color.white.opacity(0.08), lineWidth: 0.6)
                    .blur(radius: 1.2)
            )

            .shadow(
                color: Color.white.opacity(isActive ? 0.22 : 0.12),
                radius: isActive ? 12 : 8,
                x: 0,
                y: 0
            )
    }
}

//
// MARK: — iOS 26 LIQUID NAV CONTENT
//

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
  @State private var dragTranslation: CGSize = .zero
  @State private var isDragging = false
  @State private var isContainerHovered = false

  private let containerSpacing: CGFloat = 10
  private let itemSpacing: CGFloat = 8
  private let itemHeight: CGFloat = 50
  private let horizontalInset: CGFloat = 7
  private let outerHorizontalPadding: CGFloat = 12
  private let restingSelectorWidthRatio: CGFloat = 0.96
  private let draggingSelectorWidthRatio: CGFloat = 1.14
  private let restingSelectorExtraWidth: CGFloat = 0
  private let draggingSelectorExtraWidth: CGFloat = 18
  private let draggingSelectorExtraHeight: CGFloat = 4
  private let selectorOverflowAllowance: CGFloat = 24

  private var containerHeight: CGFloat {
    itemHeight + (horizontalInset * 2)
  }

  private var selectorHeight: CGFloat {
    isDragging ? containerHeight + draggingSelectorExtraHeight : containerHeight - 4
  }

  private var dragIntensity: CGFloat {
    min(max(abs(dragTranslation.width) / 84, 0), 1)
  }

  private var dragDirection: CGFloat {
    if dragTranslation.width > 0 { return 1 }
    if dragTranslation.width < 0 { return -1 }
    return 0
  }

  private var selectorVerticalOffset: CGFloat {
    if isDragging {
      return -((draggingSelectorExtraHeight * 0.5) + (dragIntensity * 2))
    }
    return 0
  }

  private var selectorLift: CGFloat {
    if isDragging {
      return -(6 + (dragIntensity * 4))
    }
    return isSelectorActive ? -2 : 0
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
    .clear
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
              .glassEffect(.regular.interactive(false), in: Capsule(style: .continuous))
          }
          .frame(height: containerHeight)
          .zIndex(0)

          GlassEffectContainer(spacing: containerSpacing) {
            selectorGlassShape(width: selectorWidth, height: selectorHeight)
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
                dragTranslation = value.translation
                isDragging = true
                let nextItem = nearestItem(at: value.location.x, totalWidth: geometry.size.width)
                if hoveredItem != nextItem {
                  hoveredItem = nextItem
                }
              }
              .onEnded { value in
                let projectedX = value.predictedEndLocation.x
                let finalItem = nearestItem(at: projectedX, totalWidth: geometry.size.width)
                  ?? nearestItem(at: value.location.x, totalWidth: geometry.size.width)
                  ?? hoveredItem
                dragLocationX = nil
                dragTranslation = .zero
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
    .foregroundStyle(isActive ? activeForegroundColor : inactiveForegroundColor)
    .shadow(color: .black.opacity(isActive ? 0.18 : 0.28), radius: 1, x: 0, y: 1)
    .opacity(isActive ? 1 : 0.76)
    .scaleEffect(isActive ? 1.07 : 1)
    .animation(.spring(response: 0.2, dampingFraction: 0.82), value: isActive)
  }

  @ViewBuilder
  private func selectorGlassShape(width: CGFloat, height: CGFloat) -> some View {
    if isDragging {
      let leadingRadius = max((height * 0.48) + (dragDirection < 0 ? dragIntensity * 10 : dragIntensity * 3), 18)
      let trailingRadius = max((height *