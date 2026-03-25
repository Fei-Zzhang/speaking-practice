//
//  OralEvaluationOnceViewController.m
//  demo
//
//  Created by tbolp on 2024/9/12.
//

#import "OralEvaluationOnceViewController.h"
#import <QCloudSOE/TAIOralConfig.h>
#import <VoiceCommon/QCloudVoiceLogger.h>
#import <AVFoundation/AVFoundation.h>
#import "datasources/FileDataSource.h"
#import "UserInfo.h"

@interface EmptySource : NSObject<TAIOralDataSource, UITextFieldDelegate>

@end

@interface OralEvaluationOnceViewController () <TAIOralListener, UITextFieldDelegate>

@property (weak, nonatomic) IBOutlet UIButton *startBtn;
@property (weak, nonatomic) IBOutlet UISegmentedControl *engineSeg;
@property (weak, nonatomic) IBOutlet UISegmentedControl *evalModeSeg;
@property (weak, nonatomic) IBOutlet UITextField *refText;
@property (weak, nonatomic) IBOutlet UISlider *coeffSlider;
@property (weak, nonatomic) IBOutlet UITextField *keywordText;
@property (weak, nonatomic) IBOutlet UITextView *resultText;


@end

@implementation OralEvaluationOnceViewController {
    id<TAIOralController> _ctl;
    NSString* _result;
    NSString* _path;
    AVAudioRecorder* _recorder;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    _refText.delegate = self;
    _keywordText.delegate = self;
    _result = @"";
    //仅供测试阶段使用
    // log等级设置为debug级别，默认为VOICE_SDK_ERROR_LEVEL
    [QCloudVoiceLogger setLoggerLevel:VOICE_SDK_DEBUG_LEVEL];
    //将log写入手机磁盘，默认为NO,日志写文件功能打开  默认会将全量log写入本地。
    [QCloudVoiceLogger needLogFile:YES];
    //注册log回调
    [QCloudVoiceLogger registerLoggerListener:^(VoiceLoggerLevel loggerLevel, NSString * _Nonnull logInfo) {
//        NSLog(@"%@",logInfo);
    } withNativeLog:NO];
    [_resultText setText:@"长按录音按钮进行录音，松开手开始对录音进行测评"];
}

- (IBAction)onRecord:(id)sender {
    [self.startBtn setTitle:@"录音中..." forState:UIControlStateNormal];
    _result = @"";
    [self.resultText setText:_result];
    AVAudioSession* avsession = [AVAudioSession sharedInstance];
    [avsession requestRecordPermission:^(BOOL granted) {}];
    [avsession setCategory:AVAudioSessionCategoryRecord error:nil];
    _path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"recording.wav"];
    NSURL* url = [NSURL fileURLWithPath:_path];
    NSDictionary* setting = @{
        AVFormatIDKey: @(kAudioFormatLinearPCM),
        AVSampleRateKey: @16000.0,
        AVNumberOfChannelsKey: @1,
        AVEncoderAudioQualityKey: @(AVAudioQualityHigh)
    };
    NSError* error = nil;
    _recorder = [[AVAudioRecorder alloc] initWithURL:url settings:setting error:&error];
    if (error == nil) {
        if ([_recorder prepareToRecord]) {
            [_recorder record];
            return;
        }
    }
    _result = [NSString stringWithFormat:@"%@\n%@", _result, error];
    [_resultText setText:_result];
    [self.startBtn setTitle:@"录音" forState:UIControlStateNormal];
}

- (IBAction)onEval:(id)sender {
    if (![_recorder isRecording]) {
        return;
    }
    [self.startBtn setTitle:@"评测中..." forState:UIControlStateNormal];
    [self.startBtn setEnabled:false];
    [_recorder stop];
    
    TAIOralConfig* config = [[TAIOralConfig alloc] init];
    config.appID = kQDAppId;
    config.secretID = kQDSecretId;
    config.secretKey = kQDSecretKey;
    config.token = kQDToken;
    [config setApiParam:kTAIVoiceFormat value:@"1"];
    [config setApiParam:kTAIServerEngineType value:self.engineSeg.selectedSegmentIndex == 0 ? @"16k_en" : @"16k_zh"];
    [config setApiParam:kTAIEvalMode value:[@(self.evalModeSeg.selectedSegmentIndex) stringValue]];
    [config setApiParam:kTAIRefText value:self.refText.text];
    [config setApiParam:kTAIScoreCoeff value:[@(self.coeffSlider.value) stringValue]];
    if (_keywordText.text.length) {
        [config setApiParam:kTAIKeyword value:_keywordText.text];
    }
    [config setApiParam:kTAIRecMode value:@"1"];
    config.connectTimeout = 3000;
    _ctl = nil;
    _ctl = [config build:[[FileDataSource alloc] init:_path] listener:self];
}

- (void)onError:(nonnull NSError *)error { 
    _result = [NSString stringWithFormat:@"%@\n%@", _result, error];
    [_resultText setText:_result];
    [self.startBtn setTitle:@"录音" forState:UIControlStateNormal];
    [self.startBtn setEnabled:true];
}

- (void)onFinish{
    [self.startBtn setTitle:@"录音" forState:UIControlStateNormal];
    [self.startBtn setEnabled:true];
}

- (void)onResult:(nonnull NSString *)result {
    _result = [NSString stringWithFormat:@"%@\n%@", _result, result];
    [_resultText setText:_result];
}

- (void)onMessage:(nonnull NSString *)value {
    _result = [NSString stringWithFormat:@"%@\n%@", _result, value];
    [_resultText setText:_result];
}

- (BOOL)textFieldShouldReturn:(UITextField *)textField
{
    [_refText resignFirstResponder];
    [_keywordText resignFirstResponder];
    return YES;
}


@end
