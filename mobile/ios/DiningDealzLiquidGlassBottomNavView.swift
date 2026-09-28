import UIKit
import React
import SwiftUI
import Combine

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

private final class DiningDealzLiquidGlassBottomNavState: ObservableObject {
  @Published var activeItem: DiningDealzLiquidGlassBottomNavItem = .map
  @Published var bottomInset: CGFloat = 0
  @Published var items: [DiningDealzLiquidGlassBottomNavDisplayItem] = []
  @Published var moreOpen = false
  @Published var themeVariant: DiningDealzLiquidGlassThemeVariant = .defaultDark
}

private final class DiningDealzBottomNavHostingController: UIHostingController<AnyView> {
  var onLayout: (() -> Void)?

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    onLayout?()
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

  private let state = DiningDealzLiquidGlassBottomNavState()
  private let hostingController = DiningDealzBottomNavHostingController(rootView: AnyView(EmptyView()))
  private var hostingViewConstraints: [NSLayoutConstraint] = []
  private var hostingAttachmentRetryScheduled = false
  private var hasConfiguredRootView = false
#if DEBUG
  private var lastLoggedLayoutSnapshot: String?
  private var lastLoggedSurfaceSnapshot: String?
  private var loggedMissingEmbeddedTabController = false
#endif

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
    CGSize(width: UIView.noIntrinsicMetric, height: 52 + CGFloat(truncating: bottomInset))
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    clearEmbeddedTabContentBackdrop()
#if DEBUG
    logHostState("layout", onlyWhenChanged: true)
    logWideSurfaces("layout", onlyWhenChanged: true)
#endif
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
#if DEBUG
    logHostState("safeAreaInsetsDidChange")
#endif
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachHostingController()
    } else {
      attachHostingControllerIfNeeded()
      clearEmbeddedTabContentBackdrop()
    }
#if DEBUG
    logHostState("didMoveToWindow")
    logWideSurfaces("didMoveToWindow")
    if window != nil {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
        guard let self, self.window != nil else { return }
        self.logWideSurfaces("settled")
      }
    }
#endif
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    if superview == nil {
      detachHostingController()
    } else if window != nil {
      attachHostingControllerIfNeeded()
    }
#if DEBUG
    logHostState("didMoveToSuperview")
#endif
  }

  private func setupView() {
    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = false
    layer.allowsGroupOpacity = true

    hostingController.view.backgroundColor = .clear
    hostingController.view.isOpaque = false
    hostingController.view.clipsToBounds = false
    hostingController.view.layer.allowsGroupOpacity = true
    hostingController.onLayout = { [weak self] in
      self?.clearEmbeddedTabContentBackdrop()
    }

    updateRootView()
  }

  private var nearestViewController: UIViewController? {
    // Prefer React Native's logical parent chain. Under Fabric interop, the
    // responder chain can be incomplete while the native view is being mounted.
    var parentView: UIView? = reactSuperview()
    while let currentView = parentView {
      if let viewController = currentView.reactViewController() {
        return viewController
      }
      parentView = currentView.reactSuperview()
    }

    // Retain the ordinary UIKit lookup as a fallback for non-RN hosting.
    var responder: UIResponder? = next
    while let currentResponder = responder {
      if let viewController = currentResponder as? UIViewController {
        return viewController
      }
      responder = currentResponder.next
    }
    return nil
  }

#if DEBUG
  private func logHostState(_ event: String, onlyWhenChanged: Bool = false) {
    let hostParent = hostingController.parent.map { NSStringFromClass(type(of: $0)) } ?? "none"
    let nearestParent = nearestViewController.map { NSStringFromClass(type(of: $0)) } ?? "none"
    let tabBarDescription: String
    if let tabBar = firstTabBar(in: hostingController.view) {
      tabBarDescription = diagnosticDescription(for: tabBar)
    } else {
      tabBarDescription = "not-found"
    }
    var ancestorDescriptions: [String] = []
    var currentAncestor: UIView? = self
    while let ancestor = currentAncestor {
      ancestorDescriptions.append(diagnosticDescription(for: ancestor))
      currentAncestor = ancestor.superview
    }
    let snapshot = "host=\(diagnosticDescription(for: self)); hostingView=\(diagnosticDescription(for: hostingController.view)); hostParent=\(hostParent); nearestParent=\(nearestParent); tabBar=\(tabBarDescription); ancestors=\(ancestorDescriptions)"

    if onlyWhenChanged, snapshot == lastLoggedLayoutSnapshot {
      return
    }
    lastLoggedLayoutSnapshot = snapshot
    NSLog("[BottomNavDiag] %@ %@", event, snapshot)
  }

  private func diagnosticDescription(for view: UIView) -> String {
    "\(NSStringFromClass(type(of: view))){frame=\(view.frame),bounds=\(view.bounds),safeArea=\(view.safeAreaInsets),opaque=\(view.isOpaque),clips=\(view.clipsToBounds),background=\(String(describing: view.backgroundColor))}"
  }

  private func logWideSurfaces(_ event: String, onlyWhenChanged: Bool = false) {
    guard bounds.width > 0, hostingController.view.superview === self else { return }

    var surfaces: [String] = []
    let minimumWidth = bounds.width * 0.55

    func visit(_ view: UIView, depth: Int) {
      guard depth <= 12 else { return }

      let frameInHost = view.convert(view.bounds, to: self)
      let className = NSStringFromClass(type(of: view))
      let isGlassView = className.localizedCaseInsensitiveContains("glass")
        || className.localizedCaseInsensitiveContains("liquid")
        || className.localizedCaseInsensitiveContains("platter")
      if (frameInHost.width >= minimumWidth || isGlassView), frameInHost.height >= 20 {
        let layerColor = view.layer.backgroundColor.map { UIColor(cgColor: $0) }
        let effect = (view as? UIVisualEffectView)?.effect.map { String(describing: $0) } ?? "-"
        surfaces.append(
          "\(depth):\(className) y=\(Int(frameInHost.minY)) h=\(Int(frameInHost.height)) bg=\(diagnosticColor(view.backgroundColor, traits: view.traitCollection)) layer=\(diagnosticColor(layerColor, traits: view.traitCollection)) opaque=\(view.isOpaque) alpha=\(String(format: "%.2f", Double(view.alpha))) hidden=\(view.isHidden) effect=\(effect)"
        )
      }

      for subview in view.subviews {
        visit(subview, depth: depth + 1)
      }
    }

    visit(hostingController.view, depth: 0)
    if let tabBar = firstTabBar(in: hostingController.view) {
      let standard = tabBar.standardAppearance
      let scrollEdge = tabBar.scrollEdgeAppearance
      let appearanceDescription = "tabBar translucent=\(tabBar.isTranslucent) standardColor=\(diagnosticColor(standard.backgroundColor, traits: tabBar.traitCollection)) standardEffect=\(String(describing: standard.backgroundEffect)) scrollEdgeColor=\(diagnosticColor(scrollEdge?.backgroundColor, traits: tabBar.traitCollection)) scrollEdgeEffect=\(String(describing: scrollEdge?.backgroundEffect))"
      surfaces.insert(appearanceDescription, at: 0)
    }

    let snapshot = surfaces.prefix(24).joined(separator: " | ")
    if onlyWhenChanged, snapshot == lastLoggedSurfaceSnapshot { return }
    lastLoggedSurfaceSnapshot = snapshot
    for (index, surface) in surfaces.prefix(24).enumerated() {
      NSLog("[BottomNavSurface] %@ %@ %@", event, String(index), surface)
    }
  }

  private func diagnosticColor(_ color: UIColor?, traits: UITraitCollection) -> String {
    guard let color else { return "-" }
    let resolvedColor = color.resolvedColor(with: traits)
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    guard resolvedColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
      return String(describing: resolvedColor)
    }
    return String(format: "%.2f,%.2f,%.2f,%.2f", Double(red), Double(green), Double(blue), Double(alpha))
  }
#endif

  private func firstTabBar(in view: UIView) -> UITabBar? {
    if let tabBar = view as? UITabBar {
      return tabBar
    }
    for subview in view.subviews {
      if let tabBar = firstTabBar(in: subview) {
        return tabBar
      }
    }
    return nil
  }

  private func clearEmbeddedTabContentBackdrop() {
    guard #available(iOS 26.0, *), let tabBar = firstTabBar(in: hostingController.view) else { return }

    // SwiftUI's embedded TabView creates a UITabBarController whose container
    // and selected tab content can default to opaque black. Clear the content
    // path synchronously during layout, without changing the tab-bar wrappers
    // or the Liquid Glass subtree that supplies the native outer shell.
    var responder: UIResponder? = tabBar
    while let current = responder {
      if let tabController = current as? UITabBarController {
        guard let containerView = tabController.viewIfLoaded else { return }
        clearBackground(of: containerView)
        if containerView.isDescendant(of: hostingController.view) {
          var ancestor = containerView.superview
          while let view = ancestor, view !== hostingController.view {
            clearBackground(of: view)
            ancestor = view.superview
          }
        }
        if let contentView = tabController.selectedViewController?.viewIfLoaded {
          if contentView.isDescendant(of: containerView) {
            var ancestor: UIView? = contentView
            while let view = ancestor, view !== containerView {
              clearBackground(of: view)
              ancestor = view.superview
            }
          }
        }
        return
      }
      responder = current.next
    }
#if DEBUG
    if !loggedMissingEmbeddedTabController {
      loggedMissingEmbeddedTabController = true
      NSLog("[BottomNavBackdrop] UITabBar found without a UITabBarController in its responder chain")
    }
#endif
  }

  private func clearBackground(of view: UIView) {
    let hadBackground = (view.backgroundColor?.cgColor.alpha ?? 0) > 0
    let wasOpaque = view.isOpaque
    guard hadBackground || wasOpaque else { return }
    if hadBackground { view.backgroundColor = .clear }
    view.isOpaque = false
#if DEBUG
    NSLog("[BottomNavBackdrop] cleared %@ background=%@ opaque=%@", NSStringFromClass(type(of: view)), hadBackground ? "yes" : "no", wasOpaque ? "yes" : "no")
#endif
  }

  private func attachHostingControllerIfNeeded(allowDeferredRetry: Bool = true) {
    guard window != nil else { return }
    guard let parentViewController = nearestViewController else {
      installHostingViewIfNeeded()
      if allowDeferredRetry {
        scheduleHostingControllerAttachmentRetry()
      }
      return
    }

    guard hostingController.parent !== parentViewController else {
      installHostingViewIfNeeded()
      return
    }

    if hostingController.parent != nil {
      detachHostingController()
    } else {
      removeHostingViewIfNeeded()
    }

    parentViewController.addChild(hostingController)
    installHostingViewIfNeeded()
    hostingController.didMove(toParent: parentViewController)
#if DEBUG
    logHostState("attachedToParent")
#endif
  }

  private func scheduleHostingControllerAttachmentRetry() {
    guard !hostingAttachmentRetryScheduled else { return }
    hostingAttachmentRetryScheduled = true

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.hostingAttachmentRetryScheduled = false
      guard self.window != nil else { return }
      self.attachHostingControllerIfNeeded(allowDeferredRetry: false)
#if DEBUG
      self.logHostState("deferredAttach")
#endif
    }
  }

  private func detachHostingController() {
    guard hostingController.parent != nil else { return }
    hostingController.willMove(toParent: nil)
    removeHostingViewIfNeeded()
    hostingController.removeFromParent()
  }

  private func installHostingViewIfNeeded() {
    guard hostingController.view.superview !== self else { return }
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(hostingController.view)

    hostingViewConstraints = [
      hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingController.view.topAnchor.constraint(equalTo: topAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor),
    ]
    NSLayoutConstraint.activate(hostingViewConstraints)
  }

  private func removeHostingViewIfNeeded() {
    guard hostingController.view.superview != nil else { return }
    NSLayoutConstraint.deactivate(hostingViewConstraints)
    hostingViewConstraints.removeAll(keepingCapacity: true)
    hostingController.view.removeFromSuperview()
  }

  private func updateRootView() {
    let currentActiveItem = resolvedActiveItem
    let currentBottomInset = CGFloat(truncating: bottomInset)
    let currentItems = resolvedItems
    let currentMoreOpen = moreOpen
    let currentThemeVariant = resolvedThemeVariant

    state.activeItem = currentActiveItem
    state.bottomInset = currentBottomInset
    state.items = currentItems
    state.moreOpen = currentMoreOpen
    state.themeVariant = currentThemeVariant

    if hostingController.overrideUserInterfaceStyle != currentThemeVariant.interfaceStyle {
      hostingController.overrideUserInterfaceStyle = currentThemeVariant.interfaceStyle
    }

    if !hasConfiguredRootView {
      hostingController.rootView = AnyView(
        Group {
          if #available(iOS 26.0, *) {
            DiningDealzLiquidGlassBottomNavContent(
              state: state,
              onSelect: handleSelection
            )
          } else {
            DiningDealzLegacyBottomNavContent(
              state: state,
              onSelect: handleSelection
            )
          }
        }
      )
      hasConfiguredRootView = true
    }
    clearEmbeddedTabContentBackdrop()
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

// MARK: — iOS 26 Native TabView (system liquid glass)

@available(iOS 26.0, *)
private struct DiningDealzLiquidGlassBottomNavContent: View {
  @ObservedObject var state: DiningDealzLiquidGlassBottomNavState
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  private var selectedTab: DiningDealzLiquidGlassBottomNavItem {
    state.moreOpen ? .more : state.activeItem
  }

  private var accentColor: Color {
    Color(red: 1, green: 0.3, blue: 0.38)
  }

  var body: some View {
    TabView(selection: Binding(
      get: { selectedTab },
      set: { onSelect($0) }
    )) {
      ForEach(state.items) { displayItem in
        Tab(displayItem.title, systemImage: displayItem.systemImageName, value: displayItem.item) {
          Color.clear
            .toolbarBackground(.visible, for: .tabBar)
        }
      }
    }
    .tabViewStyle(.tabBarOnly)
    .tint(accentColor)
  }
}

// MARK: — Legacy Fallback (pre-iOS 26)

private struct DiningDealzLegacyBottomNavContent: View {
  @ObservedObject var state: DiningDealzLiquidGlassBottomNavState
  let onSelect: (DiningDealzLiquidGlassBottomNavItem) -> Void

  private var displayedActiveItem: DiningDealzLiquidGlassBottomNavItem {
    state.moreOpen ? .more : state.activeItem
  }

  private var inactiveForegroundColor: Color {
    switch state.themeVariant {
    case .mapLight:
      return Color(red: 0.14, green: 0.18, blue: 0.25).opacity(0.82)
    case .defaultDark, .mapDark:
      return Color.white
    }
  }

  private var selectorFillColor: Color {
    switch state.themeVariant {
    case .mapLight:
      return Color.white.opacity(displayedActiveItem == .map ? 0.5 : 0.22)
    case .defaultDark, .mapDark:
      return displayedActiveItem == .map ? Color.white.opacity(0.22) : Color.white.opacity(0.12)
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      HStack(spacing: 6) {
        ForEach(state.items) { displayItem in
          Button {
            onSelect(displayItem.item)
          } label: {
            VStack(spacing: 2) {
              Image(systemName: displayItem.systemImageName)
                .font(.system(size: 16, weight: displayItem.item == displayedActiveItem ? .bold : .semibold))
                .frame(height: 18)
              Text(displayItem.title)
                .font(.system(size: 10, weight: displayItem.item == displayedActiveItem ? .bold : .medium))
                .lineLimit(1)
            }
            .foregroundStyle(displayItem.item == displayedActiveItem ? Color(red: 1, green: 0.3, blue: 0.38) : inactiveForegroundColor)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(
              displayItem.item == displayedActiveItem
                ? Capsule().fill(selectorFillColor)
                : nil
            )
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 7)
      .padding(.vertical, 7)
      .background(
        Capsule()
          .fill(.ultraThinMaterial)
      )
      .padding(.horizontal, 12)
      .padding(.bottom, max(state.bottomInset * 0.32, 4))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .background(Color.clear)
  }
}
