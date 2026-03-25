//
//  TableViewController.m
//  TAIDemo
//
//  Created by kennethmiao on 2019/1/17.
//  Copyright © 2019年 kennethmiao. All rights reserved.
//

#import "TableViewController.h"

@interface TableViewController ()
@property (nonatomic, strong) NSMutableArray *tabs;
@end

@implementation TabInfo
@end

@implementation TableViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.navigationItem.title = [NSString stringWithFormat:@"SOE Demo"];
    _tabs = [NSMutableArray array];
    
    TabInfo *info = [[TabInfo alloc] init];
    info.title = @"用户信息";
    info.className = @"ConfigViewController";
    [_tabs addObject:info];
    
    TabInfo *oral = [[TabInfo alloc] init];
    oral.title = @"口语评测(实时)";
    oral.className = @"OralEvaluationViewController";
    [_tabs addObject:oral];
    
    TabInfo *oral_once = [[TabInfo alloc] init];
    oral_once.title = @"口语评测(一句话)";
    oral_once.className = @"OralEvaluationOnceViewController";
    [_tabs addObject:oral_once];
}

- (void)viewDidAppear:(BOOL)animated {
    [super viewDidAppear:animated];
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    UIInterfaceOrientation curOrt = [UIApplication sharedApplication].statusBarOrientation;
    // Dispose of any resources that can be recreated.
}

#pragma mark - Table view data source

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    return 1;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return _tabs.count;
}


- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"reuseIdentifier"];
    if(!cell){
        cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:@"reuseIdentifier"];
    }
    TabInfo *tab = _tabs[indexPath.row];
    cell.textLabel.text = tab.title;
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    TabInfo *tab = _tabs[indexPath.row];
    UIViewController *controller = [[UIStoryboard storyboardWithName:@"Main" bundle:nil] instantiateViewControllerWithIdentifier:tab.className];
    [self.navigationController pushViewController:controller animated:YES];
    
}
@end
