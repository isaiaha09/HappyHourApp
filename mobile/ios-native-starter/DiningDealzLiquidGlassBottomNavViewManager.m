#import <React/RCTViewManager.h>
#import <React/RCTComponent.h>

@interface RCT_EXTERN_REMAP_MODULE(DiningDealzLiquidGlassBottomNavView, DiningDealzLiquidGlassBottomNavViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(activeItem, NSString)
RCT_EXPORT_VIEW_PROPERTY(bottomInset, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(mapLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(mapSystemImage, NSString)
RCT_EXPORT_VIEW_PROPERTY(moreOpen, BOOL)
RCT_EXPORT_VIEW_PROPERTY(moreLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(moreSystemImage, NSString)
RCT_EXPORT_VIEW_PROPERTY(onNavItemSelect, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(profileLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(profileSystemImage, NSString)

@end