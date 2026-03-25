//
//  FileDataSource.m
//  demo
//
//  Created by tbolp on 2023/3/30.
//

#import "FileDataSource.h"
@implementation FileDataSource {
    NSString *_path;
    NSFileHandle *_fileHandle;
    BOOL _empty;
    NSUInteger _fileSize;
    NSUInteger _offset;
}

- (instancetype)init:(NSString *)path{
    self = [super init];
    if(self){
        _path = path;
        _empty = false;
    }
    return self;
}

- (bool)empty { 
    return _empty;
}

- (nonnull NSData *)read:(int)ms error:(NSError *__autoreleasing  _Nullable * _Nullable)error {
    @try {
        if (ms < 0) {
            NSData *data = [_fileHandle readDataToEndOfFile];
            _empty = YES;
            return data;
        } else {
            NSUInteger len = ms * 16 * 2;
            NSData *chunk = [_fileHandle readDataOfLength:len];
            _offset += chunk.length;
            _empty = (_offset >= _fileSize);
            return chunk;
        }
    } @catch (NSException *exception) {
        if (error) {
            *error = [NSError errorWithDomain:@"FileReadError" 
                                      code:-1 
                                  userInfo:@{NSLocalizedDescriptionKey: exception.reason}];
        }
        return [NSData data];
    }
}

- (NSError *)start {
    _fileHandle = [NSFileHandle fileHandleForReadingAtPath:_path];
    if (!_fileHandle) {
        return [NSError errorWithDomain:@"FileError" 
                                code:-1 
                            userInfo:@{NSLocalizedDescriptionKey: @"无法打开文件"}];
    }
    
    _fileSize = [[[NSFileManager defaultManager] attributesOfItemAtPath:_path error:nil] fileSize];
    _offset = 0;
    _empty = NO;
    return nil;
}

- (NSError *)stop {
    [_fileHandle closeFile];
    _fileHandle = nil;
    return nil;
}

@end
