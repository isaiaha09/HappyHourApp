#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DiningDealzExternalPlanner, NSObject)

RCT_EXTERN_METHOD(presentCalendarComposer:(NSString *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(presentShareComposer:(NSString *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

