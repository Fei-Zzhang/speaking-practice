//
//  TAIConfig.h
//  QCloudSOE
//
//  Created by tbolp on 2024/5/23.
//

#import <Foundation/Foundation.h>
#import <QCloudSOE/TAIOralController.h>
#import <QCloudSOE/TAIOralDataSource.h>
#import <QCloudSOE/TAIOralListener.h>


NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSString* const kTAIServerEngineType;
FOUNDATION_EXPORT NSString* const kTAITextMode;
FOUNDATION_EXPORT NSString* const kTAIRefText;
FOUNDATION_EXPORT NSString* const kTAIKeyword;
FOUNDATION_EXPORT NSString* const kTAIEvalMode;
FOUNDATION_EXPORT NSString* const kTAIScoreCoeff;
FOUNDATION_EXPORT NSString* const kTAISentenceInfoEnabled;
FOUNDATION_EXPORT NSString* const kTAIVoiceFormat;
FOUNDATION_EXPORT NSString* const kTAIRecMode;

@interface TAIOralConfig : NSObject

@property (nonnull) NSString* appID;
@property (nonnull) NSString* secretID;
@property (nonnull) NSString* secretKey;
@property (nonnull) NSString* token;
@property (nullable) NSString* audioFile;
@property int vadInterval; // > 0生效,单位为ms,默认为0
@property int vadVolume; // vadInterval生效后,判断是否静音的阈值,范围为0-120,默认为20
@property int connectTimeout; // > 0 生效,单位为ms,默认为0

- (TAIOralConfig*)setApiParam:(NSString*)key value:(NSString*)value;

- (id<TAIOralController>)build:(id<TAIOralDataSource>)source listener:(id<TAIOralListener>)listener;

@end

NS_ASSUME_NONNULL_END
