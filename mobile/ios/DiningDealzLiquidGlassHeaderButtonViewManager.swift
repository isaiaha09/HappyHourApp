import Foundation
import React

@objc(DiningDealzLiquidGlassHeaderButtonViewManager)
final class DiningDealzLiquidGlassHeaderButtonViewManager: RCTViewManager {
  override func view() -> UIView! {
    DiningDealzLiquidGlassHeaderButtonView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }
}