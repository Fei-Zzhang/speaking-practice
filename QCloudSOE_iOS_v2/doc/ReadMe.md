## 接入准备

### SDK 获取

口语评测 iOS SDK 以及 Demo 的下载地址：[接入 SDK 下载]()。

### 接入须知

- 开发者在调用前请先查看口语评测的[ 接口说明]()，了解接口的**使用要求**和**使用步骤**。   
- 该接口需要手机能够连接网络（GPRS、3G 或 Wi-Fi 网络等），且系统为 **iOS 12.0** 及以上版本。
- 运行 Demo 必须设置 AppID、SecretID、SecretKey，可在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 中获取。

### SDK 导入

1. 下载并解压iOS SDK压缩包, 压缩包包含demo,sdk和doc,其中sdk/QCloudSOE.xcframework、VoiceCommon.xcframework为口语评测的SDK

2. 在工程中添加依赖库，在 build Phases Link Binary With Libraries 中添加以下库：
   
   ```
   QCloudRealTime.xcframework、VoiceCommon.framework
   ```

## 快速接入

完整代码请参考压缩包中的demo文件夹

```objectivec
...

id<TAIOralController> _ctl;

...

TAIOralConfig* config = [[TAIOralConfig alloc] init];
config.appID = kQDAppId;
config.secretID = kQDSecretId;
config.secretKey = kQDSecretKey;
config.token = kQDToken;
[config setApiParam:TAIServerEngineTypeKey value:self.engineSeg.selectedSegmentIndex == 0 ? @"16k_en" : @"16k_zh"];
[config setApiParam:TAIEvalModeKey value:[@(self.evalModeSeg.selectedSegmentIndex) stringValue]];
[config setApiParam:TAIRefTextKey value:self.refText.text];
[config setApiParam:TAIScoreCoeffKey value:[@(self.coeffSlider.value) stringValue]];
[config setApiParam:TAISentenceInfoEnabledKey value:[@(self.sentenceInfoSeg.selectedSegmentIndex) stringValue]];
if (_keywordText.text.length) {
    [config setApiParam:TAIKeywordKey value:_keywordText.text];
}
config.audioFile =  [NSString stringWithFormat:@"%@/temp.pcm", NSTemporaryDirectory()];
config.vadInterval = _vadSlider.value;
config.vadVolume = _vadVolumeSlider.value;
config.connectTimeout = 1000;
if ([_sourceSeg selectedSegmentIndex] == 0) {
    _source = [[RecordDataSource alloc] init];
} else {
    NSString* path = [NSString stringWithFormat:@"%@/%@", [[NSBundle mainBundle]bundlePath], @"hello_guagua.pcm"];
    _source = [[FileDataSource alloc] init:path];
}
_ctl =  [config build:_source listener:self];

...

[_ctl stop]
```

## 接口说明

接口示例代码为demo部分代码,完整代码请参考demo目录

**TAIOralConfig**

口语评测配置项,用于配置并创建TAIOralController

**属性**

| 类型        | 名称             | 说明                                    |
| --------- | -------------- | ------------------------------------- |
| NSString* | appID          | 腾讯云appID                              |
| NSString* | secretID       | 腾讯云secretID                           |
| NSString* | secretKey      | 腾讯云secretKey                          |
| NSString* | token          | 腾讯云临时token,设置为nil或空字符不生效              |
| NSString* | audioFile      | 数据文件,不为nil时会将从数据源读取的数据保存在此文件中         |
| int       | vadInterval    | 静音检测时长,小于等于0时关闭静音检测,单位为ms             |
| int       | vadVolume      | 静音检测音量阈值,音量阈值为0-120,默认为20,只有静音检测开启时生效 |
| int       | connectTimeout | websocket连接超时设置,大于0时生效,单位为ms          |

> **静音检测说明**
> 
> SDK内部根据音量大小和时间来判断是否静音,再音量小于vadVolume超过vadInterval的时长后判断为静音
> 
> 静音检测仅对voice_format为pcm(格式为单通道s16le)生效,其余格式不支持

**方法**

- setApiParam

设置websocket连接时传给后台的参数

```
(TAIOralConfig*)setApiParam:(NSString*)key value:(NSString*)value;
```

- build

创建TAIOralController

```
(id<TAIOralController>)build:(id<TAIOralDataSource>)source listener:(id<TAIOralListener>)listener;
```

> TAIOralController会强引用source,但不会强引用listener
> 
> TAIOralController自创建后会开始评测

**TAIOralController**

口语评测控制器,用于停止或取消评测

**方法**

- cancel

取消评测任务

```
(void)cancel;
```

> 取消任务成功后SDK会回调SOECANCELERROR类型的错误

- stop

停止评测任务

```
(void)stop;
```

> 停止评测会向服务器发送**结束评测信息**,收到服务器成功的信息会回调任务结束

**TAIOralListener**

口语评测消息回调协议

**方法**

- onFinish

评测成功

```
(void)onFinish;
```

- onError

评测失败

```
(void)onError:(NSError*)error;
```

> 一次评测任务一定会回调一次成功或失败的信息

- onMessage

评测中收到的服务端信息

```
(void)onMessage:(NSString*)value;
```

> 回调websocket连接后从服务端收到的所有信息

- onVad

静音回调

```
(void)onVad:(BOOL)value;
```

> 静音检测的规则参考TAIOralConfig说明
> 
> 静音检测为边缘触发,仅在SDK判断静音状态改变时回调
> 
> 检测到静音为True

- onVolume

音量回调

```
(void)onVolume:(int)value;
```

> 音量范围为0-120
> 
> 音量回调仅对voice_format为pcm(格式为单通道s16le)生效

- onLog

日志回调

```
(void)onLog:(NSString*)value level:(int)level;
```

> 目前level均为0

**TAIOralDataSource**

口语评测数据源协议

**方法**

- start

开始读取

```
(nullable NSError*)start;
```

> SDK内部开始读取数据源时回调该方法
> 
> 该方法返回不为nil时,评测失败,SDK回调SOEDATASOURCESTARTERROR错误

- stop

停止读取

```
(nullable NSError*)stop;
```

> SDK结束评测时回调该方法
> 
> SDK在评测中发生错误时结束时,不会主动调用stop方法,即使已经调用start方法
> 
> 该方法返回不为nil时,评测失败,SDK回调SOEDATASOURCESTOPERROR错误

- read

读取数据

```
(NSData*)read:(int)ms error:(NSError**)error;
```

> SDK会通过不断调用该方法获取音频数据并发送给后端
>
> 该方法返回的数据为ms毫秒产生的数据,当voice_format为pcm时,此时read需要返回ms * 16 * 2 字节的数据
>
> 该方法产生错误时可通过error参数传递到SDK,评测失败,SDK回调SOEDATASOURCEERROR错误
>
> 具体实现可以参demo中RecordDataSource和FileDataSource
>
> 当api参数rec_mode设置为1(即为一句话模式),此时入参ms为-1,需要一次性返回评测所需的所有数据

- empty

数据是否为空

```
(bool)empty;
```

> SDK读取数据前会调用该方法判断数据源是否还有数据
> 
> 该方法返回为True时,SDK会停止读取数据并向服务器发送结束信息

## 错误码

| 名称                      | 数值   | 说明                                |
| ----------------------- | ---- | --------------------------------- |
| SOEPARAMETERERROR       | 2000 | SDK检测到参数不合法                       |
| SOEWEBSOCKETERROR       | 2001 | Websocket错误                       |
| SOEDATASOURCESTARTERROR | 2002 | 调用数据源start失败                      |
| SOEDATASOURCESTOPERROR  | 2003 | 调用数据源stop失败                       |
| SOEDATASOURCEERROR      | 2004 | 调用数据源read失败                       |
| SOECANCELERROR          | 2005 | 参考cancel说明                        |
| SOESERVERERROR          | 2006 | 服务器返回错误,服务端返回的数据code不为0时,返回此错误    |
| SOEFILEWRITERERROR      | 2007 | 当audioFile不为空,但SDK无法正常打开文件时,返回此错误 |

> 调用数据源方法失败时,数据源返回的错误在InnerError中

## QCloudVoiceLogger  日志设置说明
```objective-c
//设置log等级为DEBUG级， 上生产环境可选择VOICE_SDK_ERROR_LEVEL级别的log
[QCloudVoiceLogger setLoggerLevel:VOICE_SDK_DEBUG_LEVEL];
// 将log写入本地磁盘，demo工程默认打开，宿主层接入上生产环境需要关闭。
[QCloudVoiceLogger needLogFile:YES];
// (可选)注册log回调
[QCloudVoiceLogger registerLoggerListener:^(VoiceLoggerLevel loggerLevel, NSString * _Nonnull logInfo) {
        NSLog(@"[ASR]-%@",logInfo);
} withNativeLog:NO];
```