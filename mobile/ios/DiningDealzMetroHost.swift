import Foundation

#if DEBUG
@objc(DiningDealzMetroHost)
final class DiningDealzMetroHost: NSObject {
  @objc static var currentHost: String?

  static func record(bundleUrl: URL?) {
    guard let host = bundleUrl?.host, isLanHost(host) else {
      return
    }

    currentHost = host
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc func constantsToExport() -> [AnyHashable: Any]! {
    ["host": Self.currentHost ?? ""]
  }

  private static func isLanHost(_ host: String) -> Bool {
    host.hasPrefix("10.")
      || host.hasPrefix("192.168.")
      || host.range(of: "^172\\.(1[6-9]|2[0-9]|3[0-1])\\.", options: .regularExpression) != nil
  }
}
#endif
