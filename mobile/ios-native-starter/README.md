# iOS Native Liquid Glass Starter

These files are starter source files for the genuine iPhone-native Liquid Glass implementation.

They are **not active in the app on Windows** because this repo still has no generated `ios/` project from Expo prebuild.

## How To Use On Mac

1. Open the repo on macOS.
2. Run:

```bash
npx expo prebuild --platform ios
```

3. Copy these files into the generated iOS app target, for example into the main app source folder under `ios/`.
4. Add all `.swift` and `.m` files to the iOS target in Xcode.
5. If Xcode prompts to enable Swift support in the project, accept it.
6. Build the iOS app.

## What These Files Provide

- `DiningDealzLiquidGlassBottomNavView.swift`
  A native bottom nav with drag-across and release-to-select behavior.

- `DiningDealzLiquidGlassBottomNavViewManager.swift`
  React Native manager for the bottom nav.

- `DiningDealzLiquidGlassBottomNavViewManager.m`
  ObjC export shim for RN prop/event exposure.

- `DiningDealzLiquidGlassHeaderButtonView.swift`
  A native pill/icon glass control for top header buttons.

- `DiningDealzLiquidGlassHeaderButtonViewManager.swift`
  React Native manager for the header button.

- `DiningDealzLiquidGlassHeaderButtonViewManager.m`
  ObjC export shim for RN prop/event exposure.

- `DiningDealzCurrentHappyHoursUpMenu.swift`
  Reusable SwiftUI models and the current happy-hours bottom-sheet UI. It renders opaque cards with listing photos, distance, live status, and vertical swipe/scroll behavior.

- `DiningDealzCurrentHappyHoursUpMenuView.swift`
  UIKit host that binds the SwiftUI menu to React Native data and events.

- `DiningDealzCurrentHappyHoursUpMenuViewManager.swift`
  React Native manager for the SwiftUI happy-hours menu.

- `DiningDealzCurrentHappyHoursUpMenuViewManager.m`
  ObjC export shim for the happy-hours menu props and events.

## Expected RN View Names

These source files export the exact names already expected by the JS side:

- `DiningDealzLiquidGlassBottomNavView`
- `DiningDealzLiquidGlassHeaderButtonView`
- `DiningDealzCurrentHappyHoursUpMenuView`

## Important Notes

- These are starter files, not production-polished UI.
- The happy-hours component intentionally does not use Liquid Glass or material blur.
- The current React Native controls remain the fallback until these native views compile and register successfully on iOS.
