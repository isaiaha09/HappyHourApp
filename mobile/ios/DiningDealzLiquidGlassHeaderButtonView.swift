import UIKit
import React
import SwiftUI

private enum DiningDealzLiquidGlassHeaderVariant: String {
  case pill
  case icon
}

@objc(DiningDealzLiquidGlassHeaderButtonView)
final class DiningDealzLiquidGlassHeaderButtonView: UIView {
  @objc var onGlassButtonPress: RCTDirectEventBlock?

  @objc var label: NSString? {
    didSet {
      invalidateIntrinsicContentSize()
      updateRootView()
    }
  }

  @objc var systemImage: NSString? {
    didSet {
      updateRootView()
    }
  }

  @objc var variant: NSString = "pill" {
    didSet {
      invalidateIntrinsicContentSize()
      updateRootView()
    }
  }

  override var accessibilityLabel: String? {
    didSet {
      updateRootView()
    }
  }

  private let hostingController = UIHostingController(rootView: AnyView(EmptyView()))

  private var resolvedVariant: DiningDealzLiquidGlassHeaderVariant {
    DiningDealzLiquidGlassHeaderVariant(rawValue: variant as String) ?? .pill
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
    if resolvedVariant == .icon {
      return CGSize(width: 40, height: 40)
    }

    let text = (label as String?) ?? ""
    let font = UIFont.systemFont(ofSize: 14, weight: .bold)
    let width = max(44, ceil((text as NSString).size(withAttributes: [.font: font]).width + 28))
    return CGSize(width: width, height: 44)
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
    let currentLabel = label as String?
    let currentSystemImage = systemImage as String?
    let currentAccessibilityLabel = accessibilityLabel
    let currentVariant = resolvedVariant

    hostingController.rootView = AnyView(
      Group {
        if #available(iOS 26.0, *) {
          DiningDealzLiquidGlassHeaderButtonContent(
            accessibilityLabel: currentAccessibilityLabel,
            label: currentLabel,
            onPress: handlePress,
            systemImage: currentSystemImage,
            variant: currentVariant
          )
        } else {
          DiningDealzLegacyHeaderButtonContent(
            accessibilityLabel: currentAccessibilityLabel,
            label: currentLabel,
            onPress: handlePress,
            systemImage: currentSystemImage,
            variant: currentVariant
          )
        }
      }
    )
  }

  @objc private func handlePress() {
    onGlassButtonPress?([:])
  }
}

@available(iOS 26.0, *)
private struct DiningDealzLiquidGlassHeaderButtonContent: View {
  let accessibilityLabel: String?
  let label: String?
  let onPress: () -> Void
  let systemImage: String?
  let variant: DiningDealzLiquidGlassHeaderVariant

  @State private var isHovering = false
  @State private var isPressing = false

  private var isActive: Bool {
    isHovering || isPressing
  }

  var body: some View {
    Button(action: onPress) {
      if variant == .icon {
        Image(systemName: systemImage ?? "questionmark")
          .font(.system(size: isActive ? 18 : 16, weight: .semibold))
          .frame(width: 40, height: 40)
      } else {
        Text(label ?? "")
          .font(.system(size: isActive ? 14 : 13, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.84)
          .allowsTightening(true)
          .padding(.horizontal, 14)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
    }
    .buttonStyle(.plain)
    .foregroundStyle(Color.white.opacity(0.96))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .diningDealzHeaderGlassEffect(variant: variant)
    .scaleEffect(isActive ? 1.18 : 1)
    .animation(.spring(response: 0.3, dampingFraction: 0.82), value: isHovering)
    .animation(.spring(response: 0.3, dampingFraction: 0.82), value: isPressing)
    .onHover { hovering in
      isHovering = hovering
    }
    .simultaneousGesture(
      DragGesture(minimumDistance: 0)
        .onChanged { _ in
          isPressing = true
        }
        .onEnded { _ in
          isPressing = false
        }
    )
    .accessibilityLabel(accessibilityLabel ?? label ?? "Button")
    .background(Color.clear)
  }
}

@available(iOS 26.0, *)
private extension View {
  @ViewBuilder
  func diningDealzHeaderGlassEffect(variant: DiningDealzLiquidGlassHeaderVariant) -> some View {
    let liquidGlassTint = Color(red: 0.62, green: 0.36, blue: 0.29).opacity(0.18)

    if variant == .icon {
      glassEffect(.regular.tint(liquidGlassTint).interactive(), in: Circle())
    } else {
      glassEffect(.regular.tint(liquidGlassTint).interactive(), in: Capsule(style: .continuous))
    }
  }
}

private struct DiningDealzLegacyHeaderButtonContent: View {
  let accessibilityLabel: String?
  let label: String?
  let onPress: () -> Void
  let systemImage: String?
  let variant: DiningDealzLiquidGlassHeaderVariant

  var body: some View {
    Button(action: onPress) {
      if variant == .icon {
        Image(systemName: systemImage ?? "questionmark")
          .font(.system(size: 16, weight: .semibold))
          .frame(width: 40, height: 40)
      } else {
        Text(label ?? "")
          .font(.system(size: 14, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.84)
          .allowsTightening(true)
          .padding(.horizontal, 18)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
    }
    .foregroundStyle(Color.white.opacity(0.96))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(
      Capsule(style: .continuous)
        .fill(Color.black.opacity(0.48))
    )
    .overlay(
      Capsule(style: .continuous)
        .stroke(Color.white.opacity(0.28), lineWidth: 1)
    )
    .accessibilityLabel(accessibilityLabel ?? label ?? "Button")
    .background(Color.clear)
  }
}
