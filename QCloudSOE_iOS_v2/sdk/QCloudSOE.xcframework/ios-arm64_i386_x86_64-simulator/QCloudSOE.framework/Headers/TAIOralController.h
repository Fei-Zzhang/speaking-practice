//
//  TAIOralController.h
//  QCloudSOE
//
//  Created by tbolp on 2024/5/23.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

enum : NSInteger {
    SOEPARAMETERERROR = 2000,
    SOEWEBSOCKETERROR = 2001,
    SOEDATASOURCESTARTERROR = 2002,
    SOEDATASOURCESTOPERROR = 2003,
    SOEDATASOURCEERROR = 2004,
    SOECANCELERROR = 2005,
    SOESERVERERROR = 2006,
    SOEFILEWRITERERROR = 2007,
};

@protocol TAIOralController<NSObject>

-(void)cancel;
-(void)stop;

@end

NS_ASSUME_NONNULL_END
