//
//  ViewController.m
//  demo
//
//  Created by tbolp on 2024/5/23.
//

#import "ViewController.h"
#import <QCloudSOE/TAIOralConfig.h>

@interface ViewController ()<TAIOralListener, TAIOralDataSource>

@end

@implementation ViewController {
    id<TAIOralController> _ctl;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view.
}


- (void)onError:(nonnull NSError *)error { 
    NSLog(@"SOE ERROR");
    NSLog(@"%@", error);
}

- (void)onFinish :(NSString*) result{ 
    NSLog(@"SOE Finish");
}

- (void)onMessage:(nonnull NSString *)value { 
    NSLog(@"%@", value);
}

- (void)onVad:(BOOL)value { 
    
}

- (BOOL)empty {
    return false;
}

- (NSData *)read:(int)ms error:(NSError *__autoreleasing  _Nullable * _Nullable)error {
    NSMutableData* data = [NSMutableData dataWithCapacity:ms*16*2];
    data.length = ms*16*2;
    return data;
}

- (NSError *)start {
    return nil;
}

- (NSError *)stop {
    return nil;
}


@end
