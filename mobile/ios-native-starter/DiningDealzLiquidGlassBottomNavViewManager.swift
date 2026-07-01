import Foundation
import React

@objc(DiningDealzLiquidGlassBottomNavViewManager)
final class DiningDealzLiquidGlassBottomNavViewManager: RCTViewManager {
  override func view() -> UIView! {
    DiningDealzLiquidGlassBottomNavView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }
}