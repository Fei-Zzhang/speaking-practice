//
//  OralEvaluationViewController.m
//  TAIDemo
//
//  Created by kennethmiao on 2018/12/26.
//  Copyright © 2018年 kennethmiao. All rights reserved.
//

#import "OralEvaluationViewController.h"
#import <QCloudSOE/TAIOralConfig.h>
#import <VoiceCommon/QCloudVoiceLogger.h>
#import <AVFoundation/AVFoundation.h>
#import "datasources/FileDataSource.h"
#import "datasources/RecordDataSource.h"
#import "datasources/AudioToolDataSource.h"
#import "UserInfo.h"
#import "Slider.h"


@interface OralEvaluationViewController () <TAIOralListener, UITextFieldDelegate>

@property (weak, nonatomic) IBOutlet UITextField *refText;

@property (weak, nonatomic) IBOutlet UISegmentedControl *evalModeSeg;
@property (weak, nonatomic) IBOutlet UISegmentedControl *engineSeg;
@property (weak, nonatomic) IBOutlet UISegmentedControl *textModeSeg;
@property (weak, nonatomic) IBOutlet UISegmentedControl *sourceSeg;
@property (weak, nonatomic) IBOutlet UITextView *resultText;
@property (weak, nonatomic) IBOutlet UIButton *actionBtn;
@property (weak, nonatomic) IBOutlet UISlider *coeffSlider;
@property (weak, nonatomic) IBOutlet Slider *vadSlider;
@property (weak, nonatomic) IBOutlet UIProgressView *volumeProgress;
@property (weak, nonatomic) IBOutlet Slider *vadVolumeSlider;
@property (weak, nonatomic) IBOutlet UISegmentedControl *sentenceInfoSeg;
@property (weak, nonatomic) IBOutlet UITextField *keywordText;

@end

@implementation OralEvaluationViewController {
    id<TAIOralDataSource> _source;
    id<TAIOralController> _ctl;
    NSString* _result;
    bool _running;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    _result = @"";
    _running = false;
    _refText.delegate = self;
    _keywordText.delegate = self;
    _vadSlider.needInt = YES;
    _vadVolumeSlider.needInt = YES;
    [_sentenceInfoSeg setSelectedSegmentIndex:1];
    //仅供测试阶段使用
    // log等级设置为debug级别，默认为VOICE_SDK_ERROR_LEVEL
    [QCloudVoiceLogger setLoggerLevel:VOICE_SDK_DEBUG_LEVEL];
    //将log写入手机磁盘，默认为NO
    [QCloudVoiceLogger needLogFile:YES];
}

- (IBAction)onClick:(id)sender {
    if(_running) {
        [_ctl stop];
    }else{
        TAIOralConfig* config = [[TAIOralConfig alloc] init];
        config.appID = kQDAppId;
        config.secretID = kQDSecretId;
        config.secretKey = kQDSecretKey;
        config.token = kQDToken;
        [config setApiParam:kTAIServerEngineType value:self.engineSeg.selectedSegmentIndex == 0 ? @"16k_en" : @"16k_zh"];
        [config setApiParam:kTAIEvalMode value:[@(self.evalModeSeg.selectedSegmentIndex) stringValue]];
        [config setApiParam:kTAIRefText value:self.refText.text];
        [config setApiParam:kTAIScoreCoeff value:[@(self.coeffSlider.value) stringValue]];
        [config setApiParam:kTAISentenceInfoEnabled value:[@(self.sentenceInfoSeg.selectedSegmentIndex) stringValue]];
        if (_keywordText.text.length) {
            [config setApiParam:kTAIKeyword value:_keywordText.text];
        }
        config.audioFile =  [NSString stringWithFormat:@"%@/temp.pcm", NSTemporaryDirectory()];
        config.vadInterval = _vadSlider.value;
        config.vadVolume = _vadVolumeSlider.value;
        config.connectTimeout = 3000;
        _ctl = nil;
        _source = nil;
        if ([_sourceSeg selectedSegmentIndex] == 0) {
            _source = [[RecordDataSource alloc] init];
        } else {
            // 文件源的pcm必须为单通道s16le格式
            NSString* path = [NSString stringWithFormat:@"%@/%@", [[NSBundle mainBundle]bundlePath], @"how_are_you.pcm"];
            _source = [[FileDataSource alloc] init:path];
            // 如果文件源不为pcm格式,可使用下面的方式
//             [config setApiParam:kTAIVoiceFormat value:@"2"];
//             NSString* path = [NSString stringWithFormat:@"%@/%@", [[NSBundle mainBundle]bundlePath], @"how_are_you.mp3"];
//             _source = [[AudioToolDataSource alloc] init:path];
        }
        _ctl =  [config build:_source listener:self];
        _result = @"";
        _running = true;
        [_actionBtn setTitle:@"停止评测" forState:UIControlStateNormal];
        [self addAudioSessionNotification];
    }
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
}


#pragma mark - ui delegate
- (BOOL)textFieldShouldReturn:(UITextField *)textField
{
    [_refText resignFirstResponder];
    [_keywordText resignFirstResponder];
    return YES;
}


- (void)onError:(nonnull NSError *)error {
    [_source stop];
    [self removeAudioSessionNotification];
    _running = false;
    _result = [NSString stringWithFormat:@"%@\n%@", _result, error];
    [_resultText setText:_result];
    [_actionBtn setTitle:@"开始评测" forState:UIControlStateNormal];
}

- (void)onFinish{
    [self removeAudioSessionNotification];
    _running = false;
    [_actionBtn setTitle:@"开始评测" forState:UIControlStateNormal];
}

- (void)onResult: (NSString *)result {
    NSLog(@"SOE RESULT-> %@",result);
    _result = [NSString stringWithFormat:@"SOE RESULT:%@\n%@", _result, result];
    [_resultText setText:_result];
}

- (void)onMessage:(nonnull NSString *)value {
    _result = [NSString stringWithFormat:@"%@\n%@", _result, value];
    [_resultText setText:_result];
    VOICE_LOG_DEBUG(@"SOE logger ----> %@", _result);
}

- (void)onVad:(BOOL)value {
    if (!value) {
        [_ctl stop];
    }
}

- (void)onVolume:(int)value {
    _volumeProgress.progress = value / 120.0;
}

- (void)onLog:(NSString *)value level:(int)level {
    VOICE_LOG_DEBUG(@"SOE logger ----> %@", value);
}


-(void)removeAudioSessionNotification{
    if (_running) {
        [[NSNotificationCenter defaultCenter]removeObserver:AVAudioSessionRouteChangeNotification];
        [[NSNotificationCenter defaultCenter]removeObserver:AVAudioSessionSilenceSecondaryAudioHintNotification];
        [[NSNotificationCenter defaultCenter]removeObserver:AVAudioSessionInterruptionNotification];
    }
}
- (void)addAudioSessionNotification {
    if (_running) {
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(otherAppAudioSessionCallBack:)
                                                     name:AVAudioSessionSilenceSecondaryAudioHintNotification object:nil];
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(systermAudioSessionCallBack:)
                                                     name:AVAudioSessionInterruptionNotification object:nil];
    }
}



// 其他app占用音频通道
- (void)otherAppAudioSessionCallBack:(NSNotification *)notification {
    NSDictionary *interuptionDict = notification.userInfo;
    NSInteger interuptType = [[interuptionDict valueForKey:AVAudioSessionSilenceSecondaryAudioHintTypeKey] integerValue];
    switch (interuptType) {
        case AVAudioSessionSilenceSecondaryAudioHintTypeBegin:{
            if(_running) {
                [_ctl stop];
            }
            NSLog(@"other app occupied session");
            break;
        }

        case AVAudioSessionSilenceSecondaryAudioHintTypeEnd:{
            NSLog(@"occupied session End");
            break;
        }
        default:
            break;
    }
}

// 电话、闹铃等一般性中断通知
- (void)systermAudioSessionCallBack:(NSNotification *)notification {
    NSDictionary *interuptionDict = notification.userInfo;
    NSInteger interuptType = [[interuptionDict valueForKey:AVAudioSessionInterruptionTypeKey] integerValue];
    switch (interuptType) {
        case AVAudioSessionInterruptionTypeBegan:{
            if(_running) {
                [_ctl stop];
            }
            NSLog(@"phone call or alarm ");
            break;
        }
        case AVAudioSessionInterruptionTypeEnded:{
            NSLog(@"occupied session End");
            break;
        }
        default:
            break;
    }
}


@end
