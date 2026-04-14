-- 学生 Interview 实时/最终转写（教师端轮询读取）；在 Supabase SQL Editor 执行一次
-- 解决多实例部署时内存 Map 不共享导致教师看不到转写的问题

CREATE TABLE IF NOT EXISTS interview_live_transcripts (
  student_username TEXT PRIMARY KEY,
  text TEXT NOT NULL DEFAULT '',
  source TEXT,
  assignment_id TEXT,
  question_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_live_updated ON interview_live_transcripts (updated_at DESC);

COMMENT ON TABLE interview_live_transcripts IS '学生端上报的 Interview 转写；教师按 student_username 读取最新一条';
