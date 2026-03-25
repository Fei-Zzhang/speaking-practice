//
//  TAIListener.h
//  QCloudSOE
//
//  Created by tbolp on 2024/5/23.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@protocol TAIOralListener<NSObject>

@required
-(void)onFinish;
-(void)onError:(NSError*)error;

@optional
-(void)onResult:(NSString*) result;
-(void)onMessage:(NSString*)value;
-(void)onVad:(BOOL)value;
-(void)onVolume:(int)value;
-(void)onLog:(NSString*)value level:(int)level;

@end

NS_ASSUME_NONNULL_END
