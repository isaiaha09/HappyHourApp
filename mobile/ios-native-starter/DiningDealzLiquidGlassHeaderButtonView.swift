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
      return CGSize(width: 44, height: 44)
    }

    let text = (label as String?) ?? ""
    let font = UIFont.systemFont(ofSize: 15, weight: .semibold)
    let width = max(88, ceil((text as NSString).size(withAttributes: [.font: font]).width + 32))
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

  var body: some View {
    Button(action: onPress) {
      if variant == .icon {
        Image(systemName: systemImage ?? "questionmark")
          .font(.system(size: 18, weight: .semibold))
          .frame(width: 44, height: 44)
      } else {
        Text(label ?? "")
          .font(.system(size: 15, weight: .semibold))
          .lineLimit(1)
          .padding(.horizontal, 16)
          .frame(minHeight: 44)
      }
    }
    .buttonStyle(.glass)
    .accessibilityLabel(accessibilityLabel ?? label ?? "Button")
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.clear)
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
          .font(.system(size: 18, weight: .semibold))
          .frame(width: 44, height: 44)
      } else {
        Text(label ?? "")
          .font(.system(size: 15, weight: .semibold))
          .lineLimit(1)
          .padding(.horizontal, 16)
          .frame(minHeight: 44)
      }
    }
    .foregroundStyle(Color(red: 0.25, green: 0.13, blue: 0.08))
    .background(
      Capsule(style: .continuous)
        .fill(Color.white.opacity(0.88))
    )
    .overlay(
      Capsule(style: .continuous)
        .stroke(Color.white.opacity(0.5), lineWidth: 1)
    )
    .accessibilityLabel(accessibilityLabel ?? label ?? "Button")
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.clear)
  }
}