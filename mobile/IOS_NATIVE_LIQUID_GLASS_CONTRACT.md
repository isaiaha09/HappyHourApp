# iOS Native Liquid Glass Contract

## Purpose

This document defines the exact native iOS contract that the Swift implementation must satisfy so the React Native app can use real SwiftUI Liquid Glass controls on supported iOS releases and keep the current JS navigation as the fallback everywhere else.

## Current JS Integration Points

The React Native side is already wired to prefer native iOS controls when matching native view managers exist.

### Bottom Nav

- JS entry point: `src/components/NativeIOSLiquidGlass.tsx`
- JS usage: `App.tsx`
- Native view manager name required: `DiningDealzLiquidGlassBottomNavView`

### Header Buttons

- JS entry point: `src/components/NativeIOSLiquidGlass.tsx`
- JS usage:
  - `src/screens/SplashScreen.tsx`
  - `src/screens/DashboardScreen.tsx`
  - `src/screens/PlaceDetailScreen.tsx`
  - `src/screens/DirectMessagesScreen.tsx`
- Native view manager name required: `DiningDealzLiquidGlassHeaderButtonView`

If those view managers are not registered at runtime, React Native automatically falls back to the existing `Pressable`-based UI.

## Required Native Views

Implement these two native iOS views:

1. `DiningDealzLiquidGlassBottomNavView`
2. `DiningDealzLiquidGlassHeaderButtonView`

They must be exposed to React Native as native UI components, not as a command-only module.

## Bottom Nav Contract

### Native View Name

`DiningDealzLiquidGlassBottomNavView`

### Props From React Native

| Prop | Type | Required | Meaning |
|---|---|---:|---|
| `activeItem` | `'map' \| 'profile' \| 'more'` | yes | Which bottom-nav item should appear active. |
| `bottomInset` | `number` | yes | Safe-area bottom inset from React Native. |
| `moreOpen` | `boolean` | no | Whether the More sheet is currently open. Treat this as active state for `more`. |
| `onNavItemSelect` | direct event | yes | Fires once on completed selection. |
| `style` | view style | no | Standard RN-applied style. |

### Events To React Native

Emit one direct event:

- Event prop: `onNavItemSelect`
- Event payload:

```ts
{
  item: 'map' | 'profile' | 'more'
}
```

### Required Behavior

- Render real SwiftUI Liquid Glass styling on supported iOS releases.
- Show three items: `map`, `profile`, `more`.
- Support drag-across selection.
- Do not emit selection continuously during drag.
- Emit `onSelect` once when the finger is released on the final item.
- Respect `bottomInset` so the control sits correctly above the home indicator.
- Treat `moreOpen=true` as visually active for the `more` item.
- Ignore Android entirely; this component should only ever be used on iOS.

### React Native Handling

When native emits `item`, JS maps it like this in `App.tsx`:

- `map` -> `handleBottomNavOpenMap()`
- `profile` -> `handleBottomNavOpenProfile()`
- `more` -> `handleBottomNavOpenMore()`

The native control must not try to own screen routing itself.

## Header Button Contract

### Native View Name

`DiningDealzLiquidGlassHeaderButtonView`

### Props From React Native

| Prop | Type | Required | Meaning |
|---|---|---:|---|
| `variant` | `'pill' \| 'icon'` | yes | Visual form factor. |
| `label` | `string` | no | Visible text for `pill` buttons. |
| `systemImage` | `string` | no | SF Symbol name for `icon` buttons. |
| `accessibilityLabel` | `string` | no | Accessibility label passed from JS. |
| `onGlassButtonPress` | direct event | yes | Fires on completed tap. |
| `style` | view style | no | Standard RN-applied style. |

### Events To React Native

Emit one direct event:

- Event prop: `onGlassButtonPress`
- Event payload:

```ts
{}
```

No extra data is required because JS already knows which action the button represents.

### Required Behavior

- Render real SwiftUI Liquid Glass styling on supported iOS releases.
- `variant='pill'` should render a labeled pill control.
- `variant='icon'` should render a circular icon control using the passed SF Symbol.
- Respect the assigned RN frame/style.
- Send one `onPress` event for a completed tap.
- Do not change app navigation directly.

## Current Header Button Mappings

### Splash Header

File: `src/screens/SplashScreen.tsx`

- pill: `label="Open Map"` -> `onOpenMap`
- pill: `label="Sign in"` -> `handleOpenSignInModal`

### Dashboard Header

File: `src/screens/DashboardScreen.tsx`

- pill: `label="Open Map"` -> `onBack`
- icon: `systemImage="paperplane"` -> `onOpenDirectMessages`
- icon: `systemImage="gearshape"` -> `onOpenSettings`

### Place Detail Header

File: `src/screens/PlaceDetailScreen.tsx`

- pill: `label={backButtonLabel}` -> `onBack`
- icon: `systemImage="paperplane"` -> `onOpenDirectMessages`

### Direct Messages Header

File: `src/screens/DirectMessagesScreen.tsx`

- pill: `label={launchedFromBusinessProfile ? backButtonLabel : 'Inbox'}` -> custom JS back logic
- pill: `label={backButtonLabel}` -> `onBack`

## iOS Implementation Notes

The Swift implementation should be split into two native view classes and two RN view managers.

Recommended shape:

- `DiningDealzLiquidGlassBottomNavViewManager`
- `DiningDealzLiquidGlassBottomNavView`
- `DiningDealzLiquidGlassHeaderButtonViewManager`
- `DiningDealzLiquidGlassHeaderButtonView`

Preferred implementation stack:

- Swift
- UIKit-hosted React Native view managers
- SwiftUI-hosted controls internally for the actual button and navigation rendering
- Standard SwiftUI Liquid Glass APIs like `.buttonStyle(.glass)` and `.buttonStyle(.glassProminent)` on the latest iOS SDK/runtime

## Minimum Native API Surface

The RN bridge must expose these prop names exactly so the existing JS code works without edits:

### Bottom Nav Props

- `activeItem`
- `bottomInset`
- `moreOpen`
- `onNavItemSelect`

### Header Button Props

- `variant`
- `label`
- `systemImage`
- `accessibilityLabel`
- `onGlassButtonPress`

## Fallback Rule

Do not remove or break the JS fallback.

The intended runtime behavior is:

- iOS with registered native view manager on a supported latest iOS runtime -> use native SwiftUI Liquid Glass control
- anything else -> render existing React Native control

That fallback logic already exists in `src/components/NativeIOSLiquidGlass.tsx`.

## Suggested Swift Event Names

For consistency with RN bubbling events:

- bottom nav event payload key: `item`
- header button event payload: empty dictionary

## Acceptance Criteria

- Native bottom nav appears only on iOS when the native manager is present.
- Native header buttons appear only on iOS when the native manager is present.
- Bottom nav selection is release-based after drag, not immediate while sliding.
- Existing JS navigation behavior remains unchanged.
- Non-iOS platforms continue using the current React Native controls.

## Next Step On Mac

1. Run `npx expo prebuild --platform ios` on macOS.
2. Add the two native iOS view managers with the exact names above.
3. Implement the props and events from this contract.
4. Verify the app switches automatically from JS fallback to native controls on iPhone.