import UIKit
import React
import SwiftUI

private enum DiningDealzLiquidGlassBottomNavItem: String, CaseIterable, Identifiable {
  case map
  case profile
  case more

  var id: String { rawValue }

  var title: String {
    switch self {
    case .map:
      return "Map"
    case .profile:
      return "Profile"
    case .more:
      return "More"
    }
  }

  var systemImageName: String {
    switch self {
    case .map:
      return "map"
    case .profile:
      return "person.crop.circle"
    case .more:
      return "line.3.horizontal"
    }
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

  @objc var moreOpen: Bool = false {
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
    CGSize(width: UIView.noIntrinsicMetric, height: 82 + CGFloat(truncating: bottomInset))
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
    let currentMoreOpen = moreOpen

    hostingController.rootView = AnyView(
      Group {
        if #available(iOS 26.0, *) {
          DiningDealzLiquidGlassBottomNavContent(
            activeItem: currentActiveItem,
            bottomInset: currentBottomInset,
            moreOpen: currentMoreOpen,
            onSelect: handleSelection
          )
        } else {
          DiningDealzLegacyBottomNavContent(
            activeItem: currentActiveItem,
            bottomInset: currentBottomInset,
            moreOpen: currentMoreOpen,
            onSelect: handleSelection
          )
        }
      }
    )
  }

  private func handleSelection(_ item: DiningDealzLiquidGlassBottomNavItem) {
    activeItem = item.rawValue as NSString
    onNavItemSelect?(["item": item.rawValue])
  }
}

@available(iOS 26.0, *)
private struct DiningDealzLiquidGlassBottomNavContent: View {
  let activeItem: DiningDealzLiquidGlassBottomNavItem
  let bottomInset: CGFloat
  let moreOpen: Bool
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  @State private var hoveredItem: DiningDealzLiquidGlassBottomNavItem?

  private let itemSpacing: CGFloat = 12

  private var displayedActiveItem: DiningDealzLiquidGlassBottomNavItem {
    hoveredItem ?? (moreOpen ? .more : activeItem)
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)

      GeometryReader { geometry in
        HStack(spacing: itemSpacing) {
          ForEach(DiningDealzLiquidGlassBottomNavItem.allCases) { item in
            Button(action: {
              onSelect(item)
            }) {
              VStack(spacing: 4) {
                Image(systemName: item.systemImageName)
                  .font(.system(size: 18, weight: .semibold))
                  .frame(height: 20)
                Text(item.title)
                  .font(.system(size: 11, weight: .semibold))
                  .lineLimit(1)
              }
              .frame(maxWidth: .infinity)
              .frame(height: 64)
            }
            .buttonStyle(displayedActiveItem == item ? .glassProminent : .glass)
          }
        }
        .contentShape(Rectangle())
        .simultaneousGesture(
          DragGesture(minimumDistance: 0)
            .onChanged { value in
              hoveredItem = item(at: value.location.x, totalWidth: geometry.size.width)
            }
            .onEnded { value in
              let finalItem = item(at: value.location.x, totalWidth: geometry.size.width) ?? hoveredItem
              hoveredItem = nil
              if let finalItem {
                onSelect(finalItem)
              }
            }
        )
      }
      .frame(height: 74)
      .padding(.horizontal, 14)
      .padding(.top, 6)
      .padding(.bottom, max(8, bottomInset))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .background(Color.clear)
  }

  private func item(at x: CGFloat, totalWidth: CGFloat) -> DiningDealzLiquidGlassBottomNavItem? {
    let items = DiningDealzLiquidGlassBottomNavItem.allCases
    let itemCount = CGFloat(items.count)
    let contentWidth = totalWidth - (itemSpacing * (itemCount - 1))
    guard contentWidth > 0 else {
      return nil
    }

    let itemWidth = contentWidth / itemCount
    guard itemWidth > 0, x >= 0, x <= totalWidth else {
      return nil
    }

    let stride = itemWidth + itemSpacing
    let index = min(Int(x / stride), items.count - 1)
    let startX = CGFloat(index) * stride
    if x > startX + itemWidth {
      return nil
    }

    return items[index]
  }
}

private struct DiningDealzLegacyBottomNavContent: View {
  let activeItem: DiningDealzLiquidGlassBottomNavItem
  let bottomInset: CGFloat
  let moreOpen: Bool
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  private var displayedActiveItem: DiningDealzLiquidGlassBottomNavItem {
    moreOpen ? .more : activeItem
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      HStack(spacing: 12) {
        ForEach(DiningDealzLiquidGlassBottomNavItem.allCases) { item in
          Button(action: {
            onSelect(item)
          }) {
            VStack(spacing: 4) {
              Image(systemName: item.systemImageName)
                .font(.system(size: 18, weight: .semibold))
                .frame(height: 20)
              Text(item.title)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 64)
          }
          .foregroundStyle(Color.white)
          .background(
            Capsule(style: .continuous)
              .fill(displayedActiveItem == item ? Color.white.opacity(0.22) : Color.white.opacity(0.12))
          )
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 6)
      .padding(.bottom, max(8, bottomInset))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .background(Color.clear)
  }
}