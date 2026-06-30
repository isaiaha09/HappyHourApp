import UIKit
import React

@objc(DiningDealzLiquidGlassBottomNavView)
final class DiningDealzLiquidGlassBottomNavView: UIView {
  @objc var onSelect: RCTBubblingEventBlock?

  @objc var activeItem: NSString = "map" {
    didSet {
      selectedItem = NavItem(rawValue: activeItem as String) ?? .map
      updateSelection(animated: true)
    }
  }

  @objc var bottomInset: NSNumber = 0 {
    didSet {
      invalidateIntrinsicContentSize()
      updateBottomPadding()
    }
  }

  @objc var moreOpen: Bool = false {
    didSet {
      updateSelection(animated: true)
    }
  }

  private enum NavItem: String, CaseIterable {
    case map
    case profile
    case more

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

  private let blurView = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
  private let highlightView = UIView()
  private let stackView = UIStackView()
  private var itemButtons: [NavItem: UIButton] = [:]
  private var hoveredItem: NavItem?
  private var selectedItem: NavItem = .map
  private var bottomPaddingConstraint: NSLayoutConstraint?

  private lazy var touchRecognizer: UILongPressGestureRecognizer = {
    let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleTouchGesture(_:)))
    recognizer.minimumPressDuration = 0
    recognizer.allowableMovement = .greatestFiniteMagnitude
    recognizer.cancelsTouchesInView = true
    return recognizer
  }()

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

  override func layoutSubviews() {
    super.layoutSubviews()
    updateSelection(animated: false)
  }

  private func setupView() {
    backgroundColor = .clear

    blurView.translatesAutoresizingMaskIntoConstraints = false
    blurView.clipsToBounds = true
    blurView.layer.cornerCurve = .continuous
    blurView.layer.cornerRadius = 28
    blurView.layer.borderWidth = 1
    blurView.layer.borderColor = UIColor.white.withAlphaComponent(0.18).cgColor

    highlightView.backgroundColor = UIColor.white.withAlphaComponent(0.16)
    highlightView.layer.cornerCurve = .continuous
    highlightView.layer.cornerRadius = 24
    highlightView.isUserInteractionEnabled = false
    highlightView.alpha = 0
    highlightView.translatesAutoresizingMaskIntoConstraints = false

    stackView.axis = .horizontal
    stackView.alignment = .fill
    stackView.distribution = .fillEqually
    stackView.spacing = 8
    stackView.translatesAutoresizingMaskIntoConstraints = false

    addSubview(blurView)
    blurView.contentView.addSubview(highlightView)
    blurView.contentView.addSubview(stackView)

    for item in NavItem.allCases {
      let button = makeButton(for: item)
      itemButtons[item] = button
      stackView.addArrangedSubview(button)
    }

    addGestureRecognizer(touchRecognizer)

    let bottomPadding = max(8, CGFloat(truncating: bottomInset))
    bottomPaddingConstraint = blurView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -bottomPadding)

    NSLayoutConstraint.activate([
      blurView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
      blurView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
      blurView.topAnchor.constraint(equalTo: topAnchor, constant: 0),
      bottomPaddingConstraint!,

      stackView.leadingAnchor.constraint(equalTo: blurView.contentView.leadingAnchor, constant: 10),
      stackView.trailingAnchor.constraint(equalTo: blurView.contentView.trailingAnchor, constant: -10),
      stackView.topAnchor.constraint(equalTo: blurView.contentView.topAnchor, constant: 10),
      stackView.bottomAnchor.constraint(equalTo: blurView.contentView.bottomAnchor, constant: -10),
    ])

    selectedItem = .map
    updateSelection(animated: false)
  }

  private func makeButton(for item: NavItem) -> UIButton {
    let button = UIButton(type: .system)
    var configuration = UIButton.Configuration.plain()
    configuration.title = item.title
    configuration.image = UIImage(systemName: item.systemImageName)
    configuration.imagePlacement = .top
    configuration.imagePadding = 4
    configuration.baseForegroundColor = UIColor.white.withAlphaComponent(0.88)
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = .systemFont(ofSize: 11, weight: .semibold)
      return outgoing
    }
    button.configuration = configuration
    button.isUserInteractionEnabled = false
    button.translatesAutoresizingMaskIntoConstraints = false
    return button
  }

  private func updateBottomPadding() {
    bottomPaddingConstraint?.constant = -max(8, CGFloat(truncating: bottomInset))
    layoutIfNeeded()
  }

  private func resolvedActiveItem() -> NavItem {
    if let hoveredItem {
      return hoveredItem
    }
    if moreOpen {
      return .more
    }
    return selectedItem
  }

  private func updateSelection(animated: Bool) {
    let active = resolvedActiveItem()

    for (item, button) in itemButtons {
      guard var configuration = button.configuration else {
        continue
      }
      configuration.baseForegroundColor = item == active
        ? UIColor.white
        : UIColor.white.withAlphaComponent(0.86)
      button.configuration = configuration
    }

    guard let activeButton = itemButtons[active] else {
      return
    }

    let targetFrame = activeButton.frame.insetBy(dx: 2, dy: 2)
    let animations = {
      self.highlightView.frame = targetFrame
      self.highlightView.alpha = 1
    }

    if animated {
      UIView.animate(withDuration: 0.22, delay: 0, usingSpringWithDamping: 0.88, initialSpringVelocity: 0.2, options: [.beginFromCurrentState, .allowUserInteraction], animations: animations)
    } else {
      animations()
    }
  }

  private func item(at point: CGPoint) -> NavItem? {
    for (item, button) in itemButtons {
      let buttonFrame = convert(button.bounds, from: button)
      if buttonFrame.contains(point) {
        return item
      }
    }
    return nil
  }

  @objc private func handleTouchGesture(_ recognizer: UILongPressGestureRecognizer) {
    let location = recognizer.location(in: self)
    switch recognizer.state {
    case .began, .changed:
      hoveredItem = item(at: location)
      updateSelection(animated: false)
    case .ended:
      let finalItem = item(at: location) ?? hoveredItem
      if let finalItem {
        selectedItem = finalItem
        activeItem = finalItem.rawValue as NSString
        onSelect?(["item": finalItem.rawValue])
      }
      hoveredItem = nil
      updateSelection(animated: true)
    default:
      hoveredItem = nil
      updateSelection(animated: true)
    }
  }
}