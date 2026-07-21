import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins
  private let debugBundleRoot = "index"

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    let provider = RCTBundleURLProvider.sharedSettings()
    if let detectedURL = provider.jsBundleURL(forBundleRoot: debugBundleRoot) {
      return detectedURL
    }

    return explicitMetroBundleURL()
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }

  private func explicitMetroBundleURL() -> URL? {
#if DEBUG
    guard let host = debugMetroHost() else {
      return nil
    }

    var components = URLComponents()
    components.scheme = "http"
    components.host = host.name
    components.port = host.port
    components.path = "/\(debugBundleRoot).bundle"
    components.queryItems = [
      URLQueryItem(name: "platform", value: "ios"),
      URLQueryItem(name: "dev", value: "true"),
      URLQueryItem(name: "lazy", value: "true"),
      URLQueryItem(name: "minify", value: "false"),
      URLQueryItem(name: "inlineSourceMap", value: "false"),
      URLQueryItem(name: "modulesOnly", value: "false"),
      URLQueryItem(name: "runModule", value: "true"),
    ]
    return components.url
#else
    return nil
#endif
  }

  private func debugMetroHost() -> (name: String, port: Int)? {
#if targetEnvironment(simulator)
    return ("localhost", 8081)
#else
    if let bundledHost = bundledMetroHost() {
      return bundledHost
    }

    if let configuredHost = configuredMetroHost() {
      return configuredHost
    }

    return nil
#endif
  }

  private func bundledMetroHost() -> (name: String, port: Int)? {
    guard let ipPath = Bundle.main.path(forResource: "ip", ofType: "txt"),
          let rawHost = try? String(contentsOfFile: ipPath, encoding: .utf8) else {
      return nil
    }

    return parseMetroHost(rawHost)
  }

  private func configuredMetroHost() -> (name: String, port: Int)? {
    guard let rawHost = Bundle.main.object(forInfoDictionaryKey: "DDMetroHost") as? String else {
      return nil
    }

    return parseMetroHost(rawHost)
  }

  private func parseMetroHost(_ value: String) -> (name: String, port: Int)? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || trimmed.contains("$(") {
      return nil
    }

    let parts = trimmed.split(separator: ":", maxSplits: 1).map(String.init)
    let host = parts[0]
    let port = parts.count > 1 ? Int(parts[1]) ?? 8081 : 8081
    return (host, port)
  }
}
