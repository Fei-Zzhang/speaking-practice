//
//  AudioToolDataSource.h
//  demo
//
//  Created by tbolp on 2024/5/29.
//

#import <Foundation/Foundation.h>
#import <QCloudSOE/TAIOralDataSource.h>

NS_ASSUME_NONNULL_BEGIN

@interface AudioToolDataSource : NSObject<TAIOralDataSource>

-(instancetype)init:(NSString*)path;

@end

NS_ASSUME_NONNULL_END
