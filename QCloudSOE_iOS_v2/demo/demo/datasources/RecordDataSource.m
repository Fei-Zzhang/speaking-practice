//
//  RecordDataSource.m
//  demo
//
//  Created by tbolp on 2023/3/24.
//

#import "RecordDataSource.h"
#import "Ring.h"
#import <AVFoundation/AVFoundation.h>

static OSStatus recordingCallback(void *inRefCon,
                                  AudioUnitRenderActionFlags *ioActionFlags,
                                  const AudioTimeStamp *inTimeStamp,
                                  UInt32 inBusNumber,
                                  UInt32 inNumberFrames,
                                  AudioBufferList *ioData);


@implementation RecordDataSource {
    AudioUnit _audioUnit;
    Ring *_ring;
    NSObject* _lock;
}

- (instancetype)init
{
    self = [super init];
    if (self) {
        _lock = [[NSObject alloc] init];
    }
    return self;
}

- (bool)empty { 
    return false;
}

- (NSData *)read:(int)ms error:(NSError *__autoreleasing  _Nullable * _Nullable)error {
    int len = ms * 16 * 2;
    NSMutableData* ret = [NSMutableData dataWithCapacity:len];
    @synchronized (self) {
        NSArray<RingInfo *> *info = [self->_ring dataInfos];
        for (RingInfo *it in info) {
            if (it.len + ret.length > len) {
                [ret appendBytes:(const void*)it.data length:len - ret.length];
                break;
            }else {
                [ret appendBytes:(const void*)it.data length:it.len];
            }
        }
        [self->_ring pop:ret.length];
    }
    return ret;
}

- (NSError *)start {
    @synchronized (_lock) {
        if (_audioUnit) {
            AudioUnitParameterValue is_running;
            UInt32 size = sizeof(AudioUnitParameterValue);
            AudioUnitGetProperty(_audioUnit, kAudioOutputUnitProperty_IsRunning, kAudioUnitScope_Global, 0, &is_running, &size);
            if (is_running) {
                return nil;
            }
        }
        AVAudioSession* avsession = [AVAudioSession sharedInstance];
        NSError* error = nil;
        [avsession requestRecordPermission:^(BOOL granted) {
            
        }];
        if([avsession recordPermission] != AVAudioSessionRecordPermissionGranted) {
            return [NSError errorWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"No Permission"}];
        }
        [avsession setCategory:AVAudioSessionCategoryRecord error:&error];
        if (error != nil) {
            return error;
        }
        [avsession setActive:YES error:&error];
        if (error != nil) {
            return error;
        }
        AudioComponentDescription desp;
        desp.componentType = kAudioUnitType_Output;
        desp.componentSubType = kAudioUnitSubType_RemoteIO;
        desp.componentManufacturer = kAudioUnitManufacturer_Apple;
        desp.componentFlags = 0;
        desp.componentFlagsMask = 0;
        
        AudioComponent input = AudioComponentFindNext(nil, &desp);
        if (input == nil) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"AudioComponentFindNext Error"}];
        }
        
        OSStatus status = AudioComponentInstanceNew(input, &_audioUnit);
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"AudioComponentInstanceNew Error", @"Status": @(status)}];
        }
        
        UInt32 enableFlag = 1;
        status = AudioUnitSetProperty(_audioUnit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &enableFlag, sizeof(enableFlag));
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"EnableIO AudioUnitSetProperty Error", @"Status": @(status)}];
        }
        AudioStreamBasicDescription audioFormat;
        audioFormat.mSampleRate = 16000.0;
        audioFormat.mFormatID = kAudioFormatLinearPCM;
        audioFormat.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
        audioFormat.mFramesPerPacket = 1;
        audioFormat.mChannelsPerFrame = 1;
        audioFormat.mBitsPerChannel = 16;
        audioFormat.mBytesPerPacket = 2;
        audioFormat.mBytesPerFrame = 2;
        
        status = AudioUnitSetProperty(_audioUnit,
                                      kAudioUnitProperty_StreamFormat,
                                      kAudioUnitScope_Output,
                                      1,
                                      &audioFormat,
                                      sizeof(audioFormat));
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"Format AudioUnitSetProperty Error", @"Status": @(status)}];
        }
        
        AURenderCallbackStruct callbackStruct;
        callbackStruct.inputProc = recordingCallback;
        callbackStruct.inputProcRefCon = (__bridge void * _Nullable)(self);
        status = AudioUnitSetProperty(_audioUnit,
                                      kAudioOutputUnitProperty_SetInputCallback,
                                      kAudioUnitScope_Global,
                                      1,
                                      &callbackStruct,
                                      sizeof(callbackStruct));
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"Callback AudioUnitSetProperty Error", @"Status": @(status)}];
        }
        
        status = AudioUnitInitialize(_audioUnit);
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"AudioUnitInitialize Error", @"Status": @(status)}];
        }
        _ring = [[Ring alloc] initWithSize:16000*2*2];
        status = AudioOutputUnitStart(_audioUnit);
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"AudioOutputUnitStart Error", @"Status": @(status)}];
        }
        return nil;
    }
}

- (nullable NSError *)stop { 
    @synchronized (_lock) {
        OSStatus status = AudioOutputUnitStop(_audioUnit);
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"AudioOutputUnitStop Error", @"Status": @(status)}];
        }
        status = AudioUnitUninitialize(_audioUnit);
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"AudioUnitUninitialize Error", @"Status": @(status)}];
        }
        status = AudioComponentInstanceDispose(_audioUnit);
        if (status != 0) {
            return [[NSError alloc] initWithDomain:@"Demo" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"AudioComponentInstanceDispose Error", @"Status": @(status)}];
        }
        _audioUnit = nil;
        return nil;
    }
}

- (void)dealloc {
    [self stop];
}

static OSStatus recordingCallback(void *inRefCon,
                                  AudioUnitRenderActionFlags *ioActionFlags,
                                  const AudioTimeStamp *inTimeStamp,
                                  UInt32 inBusNumber,
                                  UInt32 inNumberFrames,
                                  AudioBufferList *ioData) {
    RecordDataSource* source = (__bridge RecordDataSource*)inRefCon;
    AudioBufferList bufferList;
    bufferList.mNumberBuffers = 1;
    bufferList.mBuffers[0].mDataByteSize =inNumberFrames * sizeof(SInt16);
    bufferList.mBuffers[0].mNumberChannels = 1;
    bufferList.mBuffers[0].mData = malloc(inNumberFrames * sizeof(SInt16));

    OSStatus status = AudioUnitRender(source->_audioUnit,
                                      ioActionFlags,
                                      inTimeStamp,
                                      inBusNumber,
                                      inNumberFrames,
                                      &bufferList);
    @synchronized (source) {
        [source->_ring pushData:[NSData dataWithBytes:bufferList.mBuffers[0].mData length:bufferList.mBuffers[0].mDataByteSize]];
    }
    free(bufferList.mBuffers[0].mData);
    return status;
}

@end

