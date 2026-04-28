-- 学生端「趣味 Example」每日进度（与 standalone 练习页同步）
-- 在 Supabase SQL Editor 执行（新建项目请先执行本文件；若表已存在且无 badges 列，再执行 supabase-streak-badge.sql）

CREATE TABLE IF NOT EXISTS student_fun_practice (
  username TEXT PRIMARY KEY,
  next_day INTEGER NOT NULL DEFAULT 1,
  stamp_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE student_fun_practice IS '趣味 Example 练习：下一关序号、打卡日期列表、持续练习勋章等';
COMMENT ON COLUMN student_fun_practice.badges IS '已发放勋章 [{ id, label, awardedAt, streakDays? }]';
