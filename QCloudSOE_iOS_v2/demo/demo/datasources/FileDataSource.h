//
//  FileDataSource.h
//  demo
//
//  Created by tbolp on 2023/3/30.
//

#import <Foundation/Foundation.h>
#import <QCloudSOE/TAIOralDataSource.h>

NS_ASSUME_NONNULL_BEGIN

@interface FileDataSource: NSObject<TAIOralDataSource>

-(instancetype)init:(NSString*)path;

@end

NS_ASSUME_NONNULL_END
