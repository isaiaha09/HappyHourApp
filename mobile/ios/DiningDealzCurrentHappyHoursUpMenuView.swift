import UIKit
import React
import SwiftUI
import Combine

private final class DiningDealzCurrentHappyHoursUpMenuState: ObservableObject {
  @Published var places: [DiningDealzCurrentHappyHourPlace] = []
  @Published var isExpanded = false
  @Published var bottomOffset: CGFloat = 0
  @Published var theme: DiningDealzCurrentHappyHoursTheme = .dark
}

@objc(DiningDealzCurrentHappyHoursUpMenuView)
final class DiningDealzCurrentHappyHoursUpMenuView: UIView {
  @objc var onMenuToggle: RCTDirectEventBlock?
  @objc var onPlaceSelect: RCTDirectEventBlock?

  @objc var places: NSArray = [] {
    didSet {
      updateRootView()
    }
  }

  @objc var expanded = false {
    didSet {
      updateRootView()
    }
  }

  @objc var bottomOffset: NSNumber = 0 {
    didSet {
      invalidateIntrinsicContentSize()
      updateRootView()
    }
  }

  @objc var theme: NSString = "dark" {
    didSet {
      updateRootView()
    }
  }

  private let state = DiningDealzCurrentHappyHoursUpMenuState()
  private var hostingController: UIHostingController<DiningDealzCurrentHappyHoursUpMenuBridgeContent>?

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupView()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupView()
  }

  override var intrinsicContentSize: CGSize {
    let safeBottomOffset = max(CGFloat(truncating: bottomOffset), 0)
    let baseHeight: CGFloat = expanded && places.count > 0 ? 460 : 64
    return CGSize(width: UIView.noIntrinsicMetric, height: baseHeight + safeBottomOffset)
  }

  private func setupView() {
    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = false

    let rootView = DiningDealzCurrentHappyHoursUpMenuBridgeContent(
      state: state,
      onToggle: { [weak self] isExpanded in
        self?.handleToggle(isExpanded)
      },
      onSelect: { [weak self] place in
        self?.handlePlaceSelect(place)
      }
    )
    let controller = UIHostingController(rootView: rootView)
    hostingController = controller
    controller.view.backgroundColor = .clear
    controller.view.isOpaque = false
    controller.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(controller.view)

    NSLayoutConstraint.activate([
      controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      controller.view.topAnchor.constraint(equalTo: topAnchor),
      controller.view.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    updateRootView()
  }

  private func updateRootView() {
    let nextPlaces = decodePlaces(places)
    let nextBottomOffset = max(CGFloat(truncating: bottomOffset), 0)
    let nextTheme: DiningDealzCurrentHappyHoursTheme = (theme as String).lowercased() == "light" ? .light : .dark

    if state.places != nextPlaces {
      state.places = nextPlaces
    }
    if state.isExpanded != expanded {
      state.isExpanded = expanded
    }
    if state.bottomOffset != nextBottomOffset {
      state.bottomOffset = nextBottomOffset
    }
    if state.theme != nextTheme {
      state.theme = nextTheme
    }
    invalidateIntrinsicContentSize()
  }

  private func decodePlaces(_ value: NSArray) -> [DiningDealzCurrentHappyHourPlace] {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: []),
          let decoded = try? JSONDecoder().decode([DiningDealzCurrentHappyHourPlace].self, from: data) else {
      return []
    }
    return decoded
  }

  private func handleToggle(_ isExpanded: Bool) {
    if expanded != isExpanded {
      expanded = isExpanded
    }
    onMenuToggle?(["expanded": isExpanded])
  }

  private func handlePlaceSelect(_ place: DiningDealzCurrentHappyHourPlace) {
    onPlaceSelect?([
      "locationId": place.locationID,
      "slug": place.slug,
    ])
  }
}

private struct DiningDealzCurrentHappyHoursUpMenuBridgeContent: View {
  @ObservedObject var state: DiningDealzCurrentHappyHoursUpMenuState
  let onToggle: (Bool) -> Void
  let onSelect: (DiningDealzCurrentHappyHourPlace) -> Void

  var body: some View {
    DiningDealzCurrentHappyHoursUpMenu(
      places: state.places,
      isExpanded: Binding(
        get: { state.isExpanded },
        set: { isExpanded in
          guard state.isExpanded != isExpanded else { return }
          state.isExpanded = isExpanded
          onToggle(isExpanded)
        }
      ),
      bottomOffset: state.bottomOffset,
      theme: state.theme,
      onSelect: onSelect
    )
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
  }
}
