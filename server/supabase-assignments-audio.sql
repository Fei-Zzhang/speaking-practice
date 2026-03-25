-- 为“录音批改”从学生端迁移到教师端增加音频存储字段

ALTER TABLE student_submissions
  ADD COLUMN IF NOT EXISTS audio_b64 TEXT,
  ADD COLUMN IF NOT EXISTS ref_text TEXT;

-- 方便按学生查某个任务的提交
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_question
  ON student_submissions(assignment_id, question_id);

