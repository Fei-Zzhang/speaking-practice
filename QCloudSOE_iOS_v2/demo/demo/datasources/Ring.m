//
//  Ring.m
//  demo
//
//  Created by sunnydu on 2025/8/18.
//

#import <Foundation/Foundation.h>
#import "Ring.h"
@implementation RingInfo
@end

@implementation Ring
- (instancetype)initWithSize:(NSInteger)size {
    self = [super init];
    _remainLen = size + 1;
    _cache = [NSMutableData dataWithLength:_remainLen];
    return self;
}

- (NSInteger)size {
    if (_end >= _start) {
        return _end - _start;
    } else {
        return _end + _remainLen - _start;
    }
}

- (void)pushData:(NSData *)data {
    NSInteger len = data.length;
    if (len > _remainLen - 1) {
        len = _remainLen - 1;
        data = [data subdataWithRange:NSMakeRange(data.length - len, len)];
    }
    
    NSInteger remainSpace = _remainLen - 1 - [self size];
    if (remainSpace < len) {
        [self pop:len - remainSpace];
    }
    
    char *bytes = (char *)data.bytes;
    if (_end >= _start) {
        NSInteger available = _remainLen - _end;
        if (available >= len) {
            memcpy(_cache.mutableBytes + _end, bytes, len);
            _end += len;
        } else {
            memcpy(_cache.mutableBytes + _end, bytes, available);
            NSInteger remaining = len - available;
            memcpy(_cache.mutableBytes, bytes + available, remaining);
            _end = remaining;
        }
    } else {
        memcpy(_cache.mutableBytes + _end, bytes, len);
        _end += len;
    }
}

- (NSArray<RingInfo *> *)dataInfos {
    NSMutableArray *result = [NSMutableArray array];
    if (_end < _start) {
        RingInfo *info1 = [RingInfo new];
        info1.data = _cache.mutableBytes + _start;
        info1.len = _remainLen - _start;
        [result addObject:info1];
        
        RingInfo *info2 = [RingInfo new];
        info2.data = _cache.mutableBytes;
        info2.len = _end;
        [result addObject:info2];
    } else {
        RingInfo *info = [RingInfo new];
        info.data = _cache.mutableBytes + _start;
        info.len = [self size];
        [result addObject:info];
    }
    return result;
}

- (void)pop:(NSInteger)len {
    if (len >= [self size]) {
        _start = _end;
    } else {
        _start = (_start + len) % _remainLen;
    }
}

- (void)clear {
    _start = _end;
}
@end
