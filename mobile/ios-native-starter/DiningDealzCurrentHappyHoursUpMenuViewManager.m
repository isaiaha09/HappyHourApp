#import <React/RCTViewManager.h>
#import <React/RCTComponent.h>

@interface RCT_EXTERN_REMAP_MODULE(DiningDealzCurrentHappyHoursUpMenuView, DiningDealzCurrentHappyHoursUpMenuViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(bottomOffset, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(expanded, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onMenuToggle, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPlaceSelect, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(places, NSArray)
RCT_EXPORT_VIEW_PROPERTY(theme, NSString)

@end
