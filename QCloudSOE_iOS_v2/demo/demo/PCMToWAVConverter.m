//
// Created by sunnydu on 2025/3/31.
//

#import "PCMToWAVConverter.h"


@implementation PCMToWAVConverter

+ (NSData*)convertPCMToWAV:(NSData *)pcmData sampleRate:(NSInteger)sampleRate  numChannels:(NSInteger)numChannels bitsPerSample:(NSInteger)bitsPerSample {
    if (!pcmData) {
        NSLog(@"PCM data is null");
        return nil;
    }
    if (sampleRate <= 0 || numChannels <= 0 || bitsPerSample <= 0) {
        NSLog(@"Invalid parameters");
        return nil;
    }
    NSInteger byteRate = sampleRate * numChannels * bitsPerSample / 8;
    NSInteger blockAlign = numChannels * bitsPerSample / 8;
    NSInteger dataSize = pcmData.length;
    NSInteger fileSize = 36 + dataSize;
    NSMutableData *wavHeader = [NSMutableData data];
    [wavHeader appendBytes:"RIFF" length:4];
    [wavHeader appendBytes:&fileSize length:4];
    [wavHeader appendBytes:"WAVE" length:4];
    [wavHeader appendBytes:"fmt " length:4];
    NSInteger fmtChunkSize = 16;
    [wavHeader appendBytes:&fmtChunkSize length:4];
    NSInteger audioFormat = 1;
    [wavHeader appendBytes:&audioFormat length:2];
    [wavHeader appendBytes:&numChannels length:2];
    [wavHeader appendBytes:&sampleRate length:4];
    [wavHeader appendBytes:&byteRate length:4];
    [wavHeader appendBytes:&blockAlign length:2];
    [wavHeader appendBytes:&bitsPerSample length:2];
    [wavHeader appendBytes:"data" length:4];
    [wavHeader appendBytes:&dataSize length:4];
    NSMutableData *wavData = [NSMutableData dataWithData:wavHeader];
    [wavData appendData:pcmData];
    return wavData;
}
@end