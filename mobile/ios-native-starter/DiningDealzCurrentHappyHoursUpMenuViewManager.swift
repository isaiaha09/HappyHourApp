import Foundation
import React

@objc(DiningDealzCurrentHappyHoursUpMenuViewManager)
final class DiningDealzCurrentHappyHoursUpMenuViewManager: RCTViewManager {
  override func view() -> UIView! {
    DiningDealzCurrentHappyHoursUpMenuView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }
}
