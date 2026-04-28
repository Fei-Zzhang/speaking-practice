-- 连续打卡勋章：为 student_fun_practice 增加 badges 列（在 Supabase SQL Editor 执行一次）
-- 发放逻辑见 server.js POST /api/student/claim-streak-badge
--
-- 【若报错 relation "student_fun_practice" does not exist】
--   请先执行 supabase-student-fun-practice.sql 创建表（新版已内含 badges，可能无需再执行本文件）。
--
-- 【若表已存在但没有 badges 列】再单独执行下面 ALTER：

ALTER TABLE student_fun_practice ADD COLUMN IF NOT EXISTS badges JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN student_fun_practice.badges IS '已发放勋章 [{ id, label, awardedAt, streakDays? }]';
