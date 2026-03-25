//
//  Silder.m
//  demo
//
//  Created by tbolp on 2024/5/24.
//

#import "Slider.h"

@implementation Slider {
    UILabel* _label;
}

- (instancetype)initWithCoder:(NSCoder *)coder
{
    self = [super initWithCoder:coder];
    if (self) {
        _label = [[UILabel alloc] initWithFrame:CGRectMake(0, 0, 50, 30)];
        _label.textAlignment = NSTextAlignmentCenter;
        _label.textColor = [UIColor blackColor];
        _label.font = [UIFont systemFontOfSize:12.0];
        _label.hidden = YES;
        [self addSubview:_label];
    }
    return self;
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGRect rect = [self trackRectForBounds:self.bounds];
    rect = [self thumbRectForBounds:self.bounds trackRect:rect value:self.value];
    _label.center = CGPointMake(CGRectGetMidX(rect), -10);
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [super touchesBegan:touches withEvent:event];
    _label.hidden = NO;
}

- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [super touchesEnded:touches withEvent:event];
    _label.hidden = YES;
}

- (void)setValue:(float)value animated:(BOOL)animated {
    if (self.needInt) {
        value = round(value);
    }
    [super setValue:value animated:animated];
    if (self.needInt) {
        _label.text = [NSString stringWithFormat:@"%.0f", value];
    } else {
        _label.text = [NSString stringWithFormat:@"%.2f", value];
    }
}

@end
