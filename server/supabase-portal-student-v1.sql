-- 门户版学生：Interview 云端批改需教师开通；执行后由 Node 读取 users.interview_grading_approved

ALTER TABLE users ADD COLUMN IF NOT EXISTS interview_grading_approved BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.interview_grading_approved IS '学生 Interview 作业是否允许走云端 ASR+批改；Listen&Repeat 不受此字段限制';
