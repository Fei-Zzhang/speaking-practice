#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface RingInfo : NSObject
@property (nonatomic) char *data;
@property (nonatomic) NSInteger len;
@end


@interface Ring : NSObject {
    NSInteger _remainLen;
}
@property (nonatomic) NSInteger start;
@property (nonatomic) NSInteger end;
@property (strong, nonatomic) NSMutableData *cache;

- (instancetype)initWithSize:(NSInteger)size;
- (NSInteger)size;
- (void)pushData:(NSData *)data;
- (NSArray<RingInfo *> *)dataInfos;
- (void)pop:(NSInteger)len;
- (void)clear;
@end


NS_ASSUME_NONNULL_END
