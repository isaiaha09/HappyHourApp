#import <React/RCTViewManager.h>
#import <React/RCTComponent.h>

@interface RCT_EXTERN_REMAP_MODULE(DiningDealzLiquidGlassBottomNavView, DiningDealzLiquidGlassBottomNavViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(activeItem, NSString)
RCT_EXPORT_VIEW_PROPERTY(bottomInset, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(moreOpen, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onSelect, RCTBubblingEventBlock)

@end