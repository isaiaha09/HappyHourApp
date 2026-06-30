#import <React/RCTViewManager.h>
#import <React/RCTComponent.h>

@interface RCT_EXTERN_REMAP_MODULE(DiningDealzLiquidGlassHeaderButtonView, DiningDealzLiquidGlassHeaderButtonViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(accessibilityLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(label, NSString)
RCT_EXPORT_VIEW_PROPERTY(systemImage, NSString)
RCT_EXPORT_VIEW_PROPERTY(variant, NSString)
RCT_EXPORT_VIEW_PROPERTY(onGlassButtonPress, RCTDirectEventBlock)

@end