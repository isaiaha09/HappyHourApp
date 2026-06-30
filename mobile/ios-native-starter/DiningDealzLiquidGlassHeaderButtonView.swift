import UIKit
import React

@objc(DiningDealzLiquidGlassHeaderButtonView)
final class DiningDealzLiquidGlassHeaderButtonView: UIView {
  @objc var onPress: RCTBubblingEventBlock?

  @objc var label: NSString? {
    didSet {
      updateConfiguration()
      invalidateIntrinsicContentSize()
    }
  }

  @objc var systemImage: NSString? {
    didSet {
      updateConfiguration()
    }
  }

  @objc var variant: NSString = "pill" {
    didSet {
      updateAppearance()
      updateConfiguration()
      invalidateIntrinsicContentSize()
    }
  }

  override var accessibilityLabel: String? {
    didSet {
      button.accessibilityLabel = accessibilityLabel
    }
  }

  private let blurView = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
  private let button = UIButton(type: .system)

  private var resolvedVariant: String {
    variant as String
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
    if resolvedVariant == "icon" {
      return CGSize(width: 44, height: 44)
    }

    let text = (label as String?) ?? ""
    let font = UIFont.systemFont(ofSize: 15, weight: .semibold)
    let width = max(88, ceil((text as NSString).size(withAttributes: [.font: font]).width + 32))
    return CGSize(width: width, height: 44)
  }

  private func setupView() {
    backgroundColor = .clear

    blurView.translatesAutoresizingMaskIntoConstraints = false
    blurView.clipsToBounds = true
    blurView.layer.borderWidth = 1
    blurView.layer.borderColor = UIColor.white.withAlphaComponent(0.18).cgColor
    blurView.layer.cornerCurve = .continuous

    button.translatesAutoresizingMaskIntoConstraints = false
    button.addTarget(self, action: #selector(handlePress), for: .touchUpInside)

    addSubview(blurView)
    blurView.contentView.addSubview(button)

    NSLayoutConstraint.activate([
      blurView.leadingAnchor.constraint(equalTo: leadingAnchor),
      blurView.trailingAnchor.constraint(equalTo: trailingAnchor),
      blurView.topAnchor.constraint(equalTo: topAnchor),
      blurView.bottomAnchor.constraint(equalTo: bottomAnchor),

      button.leadingAnchor.constraint(equalTo: blurView.contentView.leadingAnchor),
      button.trailingAnchor.constraint(equalTo: blurView.contentView.trailingAnchor),
      button.topAnchor.constraint(equalTo: blurView.contentView.topAnchor),
      button.bottomAnchor.constraint(equalTo: blurView.contentView.bottomAnchor),
    ])

    updateAppearance()
    updateConfiguration()
  }

  private func updateAppearance() {
    let isIcon = resolvedVariant == "icon"
    blurView.layer.cornerRadius = isIcon ? 22 : 22
  }

  private func updateConfiguration() {
    let isIcon = resolvedVariant == "icon"
    var configuration = UIButton.Configuration.plain()
    configuration.baseForegroundColor = UIColor(red: 0.25, green: 0.13, blue: 0.08, alpha: 1)
    configuration.contentInsets = .zero

    if isIcon {
      if let symbolName = systemImage as String? {
        configuration.image = UIImage(systemName: symbolName)
      }
      configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
    } else {
      configuration.title = label as String?
      configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
        var outgoing = incoming
        outgoing.font = .systemFont(ofSize: 15, weight: .semibold)
        return outgoing
      }
      configuration.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16)
    }

    button.configuration = configuration
  }

  @objc private func handlePress() {
    onPress?([:])
  }
}