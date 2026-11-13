import UIKit
internal import Expo

private let diningDealzLaunchBackgroundColor = UIColor(
  red: 8.0 / 255.0,
  green: 1.0 / 255.0,
  blue: 1.0 / 255.0,
  alpha: 1
)

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)

    window?.backgroundColor = diningDealzLaunchBackgroundColor
    window?.rootViewController?.view.backgroundColor = diningDealzLaunchBackgroundColor
    window?.rootViewController?.view.isOpaque = true
  }
}
