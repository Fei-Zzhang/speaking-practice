-- 在 Supabase 控制台 → SQL Editor 里执行此脚本，创建所需表

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 若登录仍报错，可执行下面两行放开权限（后端用 service_role 一般不需要）
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for users" ON users FOR ALL USING (true) WITH CHECK (true);

-- 练习记录表
CREATE TABLE IF NOT EXISTS practice_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  section_id TEXT NOT NULL,
  section_title TEXT,
  mcq_answers JSONB DEFAULT '{}',
  mcq_score INT,
  speaking_text TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- 方便按用户查记录
CREATE INDEX IF NOT EXISTS idx_practice_records_username ON practice_records(username);
CREATE INDEX IF NOT EXISTS idx_practice_records_submitted_at ON practice_records(submitted_at DESC);

-- 教师布置 / 学生任务：另见同目录 supabase-assignments.sql（用户 role + assignments 等）
-- 学生录音存库（教师批改）：另见 supabase-assignments-audio.sql
