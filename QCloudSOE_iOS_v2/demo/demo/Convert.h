//
//  Convert.h
//  此文件用于将新版SOE返回的json字符串转换为基础版SOE的TAIOralEvaluationRet类
//  仅用于基础版升级新版SOE时有需要的客户进行参考
//  Created by tbolp on 2024/8/21.
//

#ifndef Convert_h
#define Convert_h

#import <Foundation/Foundation.h>

@interface TAIOralEvaluationPhoneInfo : NSObject
//当前音节语音起始时间点，单位为ms
@property (nonatomic, assign) int beginTime;
//当前音节语音终止时间点，单位为ms
@property (nonatomic, assign) int endTime;
//音节发音准确度，取值范围[-1, 100]，当取-1时指完全不匹配
@property (nonatomic, assign) float pronAccuracy;
//当前音节是否检测为重音
@property (nonatomic, assign) BOOL detectedStress;
//当前音节
@property (nonatomic, strong) NSString *phone;
//当前音节是否应为重音
@property (nonatomic, assign) BOOL stress;
//参考音素，在单词诊断模式下，代表标准音素
@property (nonatomic, strong) NSString *referencePhone;
//音素对应的字母
@property (nonatomic, strong) NSString *rLetter;
//当前词与输入语句的匹配情况，0：匹配单词、1：新增单词、2：缺少单词、3：错读的词、4：未录入单词。
@property (nonatomic, assign) int matchTag;

@end

@interface TAIOralEvaluationWord : NSObject
//当前单词语音起始时间点，单位为ms
@property (nonatomic, assign) int beginTime;
//当前单词语音终止时间点，单位为ms
@property (nonatomic, assign) int endTime;
//单词发音准确度，取值范围[-1, 100]，当取-1时指完全不匹配
@property (nonatomic, assign) float pronAccuracy;
//单词发音流利度，取值范围[0, 1]
@property (nonatomic, assign) float pronFluency;
//当前词
@property (nonatomic, strong) NSString *word;
//当前词与输入语句的匹配情况，0:匹配单词、1：新增单词、2：缺少单词
@property (nonatomic, assign) int matchTag;
//音节评估详情
@property (nonatomic, strong) NSArray<TAIOralEvaluationPhoneInfo *> *phoneInfos;
//参考词
@property (nonatomic, strong) NSString *referenceWord;
//主题词命中标志，0表示没命中，1表示命中, 注意：此字段可能返回 null，表示取不到有效值。
@property (nonatomic, strong) NSNumber *keywordTag;

@end

@interface TAIOralEvaluationSentenceInfo : NSObject
//句子序号，在段落、自由说模式下有效，表示断句序号，最后的综合结果的为-1.
@property (nonatomic, assign) int sentenceId;
//详细发音评估结果
@property (nonatomic, strong) NSArray<TAIOralEvaluationWord *> *words;
//发音精准度，取值范围[-1, 100]，当取-1时指完全不匹配，当为句子模式时，是所有已识别单词准确度的加权平均值，在reftext中但未识别出来的词不计入分数中
@property (nonatomic, assign) float pronAccuracy;
//发音流利度，取值范围[0, 1]，当为词模式时，取值无意义；当为流式模式且请求中IsEnd未置1时，取值无意义
@property (nonatomic, assign) float pronFluency;
//发音完整度，取值范围[0, 1]，当为词模式时，取值无意义；当为流式模式且请求中IsEnd未置1时，取值无意义
@property (nonatomic, assign) float pronCompletion;
//建议评分，取值范围[0,100]，评分方式为建议评分 = 准确度（pronAccuracyfloat） 完整度（pronCompletionfloat）（2 - 完整度（pronCompletionfloat）），如若评分策略不符合请参考Words数组中的详细分数自定义评分逻辑
@property (nonatomic, assign) float suggestedScore;
// 匹配候选文本的序号，在句子多分支、情景对 话、段落模式下表示匹配到的文本序号。注意：此字段可能返回 null，表示取不到有效值。
@property (nonatomic, strong) NSNumber *refTextId;
// 主题词命中标志，0表示没命中，1表示命中。注意：此字段可能返回 null，表示取不到有效值。
@property (nonatomic, strong) NSArray<NSNumber *> *keyWordHits;
// 负向主题词命中标志，0表示没命中，1表示命中。 注意：此字段可能返回 null，表示取不到有效值。
@property (nonatomic, strong) NSArray<NSNumber *> *unKeyWordHits;

@end

@interface TAIOralEvaluationRet : NSObject
//唯一标识一次评测
@property (nonatomic, strong) NSString *sessionId;
//唯一请求ID
@property (nonatomic, strong) NSString *requestId;
//单词发音准确度，取值范围[-1, 100]，当取-1时指完全不匹配
@property (nonatomic, assign) float pronAccuracy;
//单词发音流利度，取值范围[0, 1]
@property (nonatomic, assign) float pronFluency;
//发音完整度，取值范围[0, 1]，当为词模式时，取值无意义
@property (nonatomic, assign) float pronCompletion;
//保存语音音频文件的下载地址（TAIOralEvaluationStorageMode_Enable有效）
@property (nonatomic, strong) NSString *audioUrl;
//详细发音评估结果
@property (nonatomic, strong) NSArray<TAIOralEvaluationWord *> *words;
//建议评分，取值范围[0,100]
//评分方式为建议评分 = 准确度（PronAccuracyfloat）× 完整度（PronCompletionfloat）×（2 - 完整度（PronCompletionfloat））
//如若评分策略不符合请参考Words数组中的详细分数自定义评分逻辑。
@property (nonatomic, assign) float suggestedScore;
//断句中间结果
@property (nonatomic, strong) NSArray<TAIOralEvaluationSentenceInfo*> *sentenceInfoSet;
//评估 session 状态，“Evaluating"：评估中、"Failed"：评估失败、"Finished"：评估完成
@property (nonatomic, strong) NSString *status;
// 匹配候选文本的序号，在句子多分支、情景对 话、段落模式下表示匹配到的文本序号。注意：此字段可能返回 null，表示取不到有效值。
@property (nonatomic, strong) NSNumber *refTextId;
// 主题词命中标志，0表示没命中，1表示命中。 注意：此字段可能返回 null，表示取不到有效值。
@property (nonatomic, strong) NSArray<NSNumber *> *keyWordHits;
// 负向主题词命中标志，0表示没命中，1表示命中。注意：此字段可能返回 null，表示取不到有效值。
@property (nonatomic, strong) NSArray<NSNumber *> *unKeyWordHits;

@end

@implementation TAIOralEvaluationPhoneInfo

- (NSDictionary *)toDictionary {
    return @{
        @"beginTime": @(self.beginTime),
        @"endTime": @(self.endTime),
        @"pronAccuracy": @(self.pronAccuracy),
        @"detectedStress": @(self.detectedStress),
        @"phone": self.phone,
        @"stress": @(self.stress),
        @"referencePhone": self.referencePhone,
        @"rLetter": self.rLetter,
        @"matchTag": @(self.matchTag)
    };
}

+ (instancetype)fromDictionary:(NSDictionary *)dict {
    TAIOralEvaluationPhoneInfo *phoneInfo = [[TAIOralEvaluationPhoneInfo alloc] init];
    phoneInfo.beginTime = [dict[@"MemBeginTime"] intValue];
    phoneInfo.endTime = [dict[@"MemEndTime"] intValue];
    phoneInfo.pronAccuracy = [dict[@"PronAccuracy"] floatValue];
    phoneInfo.detectedStress = [dict[@"DetectedStress"] boolValue];
    phoneInfo.phone = dict[@"Phone"];
    phoneInfo.stress = [dict[@"Stress"] boolValue];
    phoneInfo.referencePhone = dict[@"ReferencePhone"];
    phoneInfo.rLetter = dict[@"ReferenceLetter"];
    phoneInfo.matchTag = [dict[@"MatchTag"] intValue];
    return phoneInfo;
}

@end

@implementation TAIOralEvaluationWord

- (NSDictionary *)toDictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    dict[@"beginTime"] = @(self.beginTime);
    dict[@"endTime"] = @(self.endTime);
    dict[@"pronAccuracy"] = @(self.pronAccuracy);
    dict[@"pronFluency"] = @(self.pronFluency);
    dict[@"word"] = self.word;
    dict[@"matchTag"] = @(self.matchTag);
    // 处理数组属性 phoneInfos
    NSMutableArray *phoneInfosArray = [NSMutableArray array];
    for (TAIOralEvaluationPhoneInfo *phoneInfo in self.phoneInfos) {
        [phoneInfosArray addObject:[phoneInfo toDictionary]];
    }
    dict[@"phoneInfos"] = phoneInfosArray;
    dict[@"referenceWord"] = self.referenceWord;
    dict[@"keywordTag"] = self.keywordTag ?: [NSNull null]; // 处理可能为 null 的情况
    
    return dict;
}

+ (instancetype)fromDictionary:(NSDictionary *)dict {
    TAIOralEvaluationWord *word = [[TAIOralEvaluationWord alloc] init];
    word.beginTime = [dict[@"MemBeginTime"] intValue];
    word.endTime = [dict[@"MemEndTime"] intValue];
    word.pronAccuracy = [dict[@"PronAccuracy"] floatValue];
    word.pronFluency = [dict[@"PronFluency"] floatValue];
    word.word = dict[@"Word"];
    word.matchTag = [dict[@"MatchTag"] intValue];
    // 处理数组属性 phoneInfos
    NSMutableArray *phoneInfosArray = [NSMutableArray array];
    for (NSDictionary *phoneInfoDict in dict[@"PhoneInfos"]) {
        TAIOralEvaluationPhoneInfo *phoneInfo = [TAIOralEvaluationPhoneInfo fromDictionary:phoneInfoDict];
        [phoneInfosArray addObject:phoneInfo];
    }
    word.phoneInfos = phoneInfosArray;
    word.referenceWord = dict[@"ReferenceWord"];
    word.keywordTag = dict[@"KeywordTag"] == [NSNull null] ? nil : dict[@"KeywordTag"];
    return word;
}

@end

@implementation TAIOralEvaluationSentenceInfo

- (NSDictionary *)toDictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    dict[@"sentenceId"] = @(self.sentenceId);
    dict[@"pronAccuracy"] = @(self.pronAccuracy);
    dict[@"pronFluency"] = @(self.pronFluency);
    dict[@"pronCompletion"] = @(self.pronCompletion);
    dict[@"suggestedScore"] = @(self.suggestedScore);
    // 处理数组属性 words
    NSMutableArray *wordsArray = [NSMutableArray array];
    for (TAIOralEvaluationWord *word in self.words) {
        [wordsArray addObject:[word toDictionary]];
    }
    dict[@"words"] = wordsArray;
    dict[@"refTextId"] = self.refTextId ?: [NSNull null]; // 处理可能为 nil 的情况
    dict[@"keyWordHits"] = self.keyWordHits ?: @[]; // 处理可能为 nil 的情况
    dict[@"unKeyWordHits"] = self.unKeyWordHits ?: @[]; // 处理可能为 nil 的情况
    return dict;
}

+ (instancetype)fromDictionary:(NSDictionary *)dict {
    TAIOralEvaluationSentenceInfo *sentenceInfo = [[TAIOralEvaluationSentenceInfo alloc] init];
    sentenceInfo.sentenceId = [dict[@"SentenceId"] intValue];
    sentenceInfo.pronAccuracy = [dict[@"PronAccuracy"] floatValue];
    sentenceInfo.pronFluency = [dict[@"PronFluency"] floatValue];
    sentenceInfo.pronCompletion = [dict[@"PronCompletion"] floatValue];
    sentenceInfo.suggestedScore = [dict[@"SuggestedScore"] floatValue];
    // 处理数组属性 words
    NSMutableArray *wordsArray = [NSMutableArray array];
    for (NSDictionary *wordDict in dict[@"Words"]) { 
        TAIOralEvaluationWord *word = [TAIOralEvaluationWord fromDictionary:wordDict];
        [wordsArray addObject:word];
    }
    sentenceInfo.words = wordsArray;
    sentenceInfo.refTextId = dict[@"RefTextId"] == [NSNull null] ? nil : dict[@"RefTextId"]; // 处理可能为 nil 的情况
    sentenceInfo.keyWordHits = dict[@"KeyWordHits"] == [NSNull null] ? nil : dict[@"KeyWordHits"]; // 处理可能为 nil 的情况
    sentenceInfo.unKeyWordHits = dict[@"UnKeyWordHits"] == [NSNull null] ? nil : dict[@"UnKeyWordHits"]; // 处理可能为 nil 的情况
    return sentenceInfo;
}

@end

@implementation TAIOralEvaluationRet

- (NSDictionary *)toDictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    dict[@"sessionId"] = self.sessionId;
    dict[@"requestId"] = self.requestId;
    dict[@"pronAccuracy"] = @(self.pronAccuracy);
    dict[@"pronFluency"] = @(self.pronFluency);
    dict[@"pronCompletion"] = @(self.pronCompletion);
    dict[@"audioUrl"] = self.audioUrl;
    dict[@"suggestedScore"] = @(self.suggestedScore);
    dict[@"status"] = self.status;
    // 处理数组属性 words
    NSMutableArray *wordsArray = [NSMutableArray array];
    for (TAIOralEvaluationWord *word in self.words) {
        [wordsArray addObject:[word toDictionary]];
    }
    dict[@"words"] = wordsArray;
    // 处理数组属性 sentenceInfoSet
    NSMutableArray *sentenceInfoSetArray = [NSMutableArray array];
    for (TAIOralEvaluationSentenceInfo *sentenceInfo in self.sentenceInfoSet) {
        [sentenceInfoSetArray addObject:[sentenceInfo toDictionary]];
    }
    dict[@"sentenceInfoSet"] = sentenceInfoSetArray;
    dict[@"refTextId"] = self.refTextId ?: [NSNull null];
    dict[@"keyWordHits"] = self.keyWordHits ?: @[];
    dict[@"unKeyWordHits"] = self.unKeyWordHits ?: @[];
    dict[@"audioUrl"] = self.audioUrl;
    return dict;
}

+ (instancetype)fromDictionary:(NSDictionary *)dict {
    TAIOralEvaluationRet* ret = [[TAIOralEvaluationRet alloc] init];
    ret.audioUrl = @"";
    ret.keyWordHits = @[];
    ret.unKeyWordHits = @[];
    if ([dict[@"code"] integerValue] != 0) {
        ret.sessionId = dict[@"voice_id"];
        ret.requestId = dict[@"voice_id"];
        ret.status = @"Failed";
        return ret;
    }
    if ([dict[@"final"] integerValue] == 1) {
        ret.status = @"Finished";
    }else {
        ret.status = @"Evaluating";
    }
    ret.sessionId = dict[@"voice_id"];
    ret.requestId = dict[@"voice_id"];
    if (dict[@"result"] && [NSNull null] != dict[@"result"]) {
        TAIOralEvaluationSentenceInfo* sentence_info = [TAIOralEvaluationSentenceInfo fromDictionary:dict[@"result"]];
        ret.pronAccuracy = sentence_info.pronAccuracy;
        ret.pronFluency = sentence_info.pronFluency;
        ret.pronCompletion = sentence_info.pronCompletion;
        ret.suggestedScore = sentence_info.suggestedScore;
        ret.refTextId = sentence_info.refTextId;
        ret.keyWordHits = sentence_info.keyWordHits;
        ret.unKeyWordHits = sentence_info.unKeyWordHits;
        ret.words = sentence_info.words;
        ret.sentenceInfoSet = @[sentence_info];
    }
    return ret;
}

@end

TAIOralEvaluationRet* unmarshal(NSString* json, NSError** error) {
    NSDictionary* rsp = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:error];
    if (error != nil && *error != nil) {
        return nil;
    }
    return [TAIOralEvaluationRet fromDictionary:rsp];
}

NSString* marshal(TAIOralEvaluationRet* val, NSError** error) {
    NSData* data = [NSJSONSerialization dataWithJSONObject:[val toDictionary] options:NSJSONWritingPrettyPrinted error:error];
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}


#endif /* Convert_h */
