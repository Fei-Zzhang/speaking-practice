-- 教师布置任务 + 学生提交（在 Supabase SQL Editor 执行）

-- 用户角色：student | teacher
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student';

-- 任务（教师创建）
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_username TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '口语练习任务',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_username);
CREATE INDEX IF NOT EXISTS idx_assignments_created ON assignments(created_at DESC);

-- 任务下发对象
CREATE TABLE IF NOT EXISTS assignment_targets (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_username TEXT NOT NULL,
  PRIMARY KEY (assignment_id, student_username)
);

CREATE INDEX IF NOT EXISTS idx_assignment_targets_student ON assignment_targets(student_username);

-- 学生每题提交记录（评测结果快照）
CREATE TABLE IF NOT EXISTS student_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_username TEXT NOT NULL,
  question_id TEXT NOT NULL,
  eval_data JSONB DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assignment_id, student_username, question_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_student ON student_submissions(student_username);
