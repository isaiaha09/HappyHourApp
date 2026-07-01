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
    .background {
      if variant == .icon {
        Circle()
          .fill(Color.white.opacity(isActive ? 0.13 : 0.055))
          .glassEffect(.regular.interactive(false), in: Circle())
          .overlay(
            Circle()
              .stroke(
                LinearGradient(
                  colors: [
                    Color.white.opacity(0.52),
                    Color.white.opacity(0.2),
                    Color.white.opacity(0.06),
                  ],
                  startPoint: .topLeading,
                  endPoint: .bottomTrailing
                ),
                lineWidth: 0.8
              )
          )
      } else {
        Capsule(style: .continuous)
          .fill(Color.white.opacity(isActive ? 0.13 : 0.055))
          .glassEffect(.regular.interactive(false), in: Capsule(style: .continuous))
          .overlay(
            Capsule(style: .continuous)
              .stroke(
                LinearGradient(
                  colors: [
                    Color.white.opacity(0.52),
                    Color.white.opacity(0.2),
                    Color.white.opacity(0.06),
                  ],
                  startPoint: .topLeading,
                  endPoint: .bottomTrailing
                ),
                lineWidth: 0.8
              )
          )
      }
    }
    .scaleEffect(isActive ? 1.18 : 1)
    .shadow(color: .black.opacity(0.14), radius: 12, x: 0, y: 5)
    .shadow(color: .white.opacity(0.22), radius: 2, x: 0, y: -1)
    .animation(.spring(response: 0.22, dampingFraction: 0.82), value: isHovering)
    .animation(.spring(response: 0.16, dampingFraction: 0.78), value: isPressing)
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
          .padding(.horizontal, 14)
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
