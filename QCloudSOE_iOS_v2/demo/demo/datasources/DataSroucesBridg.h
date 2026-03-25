//
//  DataSroucesBridg.h
//  demo
//
//  Created by sunnydu on 2025/8/18.
//
/**
 如果需要swift接入datasources里面的示例代码，需要将这个头文件复制到swtift宿主工程。再工程配置中的Objective-C Bridging Header 标签内配置本头文件路径
  配置路径示例：$(SRCROOT)/datasources/DataSroucesBridg.h
 */
#ifndef DataSroucesBridg_h
#define DataSroucesBridg_h
#import "FileDataSource.h"
#import "AudioToolDataSource.h"
#import "RecordDataSource.h"
#import "Ring.h"

#endif /* DataSroucesBridg_h */
