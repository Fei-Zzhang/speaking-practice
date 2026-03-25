//
//  TAIDataSource.h
//  QCloudSOE
//
//  Created by tbolp on 2024/5/23.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@protocol TAIOralDataSource<NSObject>

-(nullable NSError*)start;
-(nullable NSError*)stop;
-(NSData*)read:(int)ms error:(NSError**)error;
-(bool)empty;

@end

NS_ASSUME_NONNULL_END
