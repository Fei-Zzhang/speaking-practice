//
// Created by sunnydu on 2025/3/31.
//

#import <Foundation/Foundation.h>


@interface PCMToWAVConverter : NSObject
/**
 * 将PCM文件转换为WAV文件
 * @param pcmFilePath PCM文件的路径
 * @param wavFilePath 输出WAV文件的路径
 * @param sampleRate 采样率
 * @param numChannels 声道数
 * @param bitsPerSample 每个样本的位数
 * @return WAV流数据，nil表示转换失败
 */
+ (NSData*)convertPCMToWAV:(NSData *)pcmData sampleRate:(NSInteger)sampleRate  numChannels:(NSInteger)numChannels bitsPerSample:(NSInteger)bitsPerSample;
@end