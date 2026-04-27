-- 班级 + 入班 + 录音打卡（在 Supabase SQL Editor 执行；后端用 service_role 访问）
-- 执行前请已存在 public.users 表（见 supabase-tables.sql）

-- 教师创建的班级
CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_username TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_username);
CREATE INDEX IF NOT EXISTS idx_classrooms_created ON classrooms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classrooms_name ON classrooms(name);

-- 学生入班（一名学生可加入多个班级）
CREATE TABLE IF NOT EXISTS classroom_members (
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_username TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (classroom_id, student_username)
);

CREATE INDEX IF NOT EXISTS idx_classroom_members_student ON classroom_members(student_username);

-- 班级内录音打卡记录（eval_data 与 Interview 作业提交结构一致，来自 Python /api/upload-audio-correct）
CREATE TABLE IF NOT EXISTS classroom_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_username TEXT NOT NULL,
  note TEXT,
  eval_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classroom_checkins_class_time ON classroom_checkins(classroom_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_classroom_checkins_student ON classroom_checkins(student_username);

-- 教师对单次打卡的文本反馈（在 Supabase 已执行过旧版脚本时补列）
ALTER TABLE classroom_checkins ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;
ALTER TABLE classroom_checkins ADD COLUMN IF NOT EXISTS teacher_feedback_at TIMESTAMPTZ;

COMMENT ON TABLE classrooms IS '教师端创建的班级，学生浏览后加入';
COMMENT ON TABLE classroom_checkins IS '学生在本班的录音打卡；含 ASR+TokenHub 的 eval_data 快照';
COMMENT ON COLUMN classroom_checkins.teacher_feedback IS '教师对本次作业的文字反馈';
