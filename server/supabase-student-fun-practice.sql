-- 学生端「趣味 Example」每日进度（与 standalone 练习页同步）
-- 在 Supabase SQL Editor 执行

CREATE TABLE IF NOT EXISTS student_fun_practice (
  username TEXT PRIMARY KEY,
  next_day INTEGER NOT NULL DEFAULT 1,
  stamp_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE student_fun_practice IS '趣味 Example 练习：下一关序号、打卡日期列表';
