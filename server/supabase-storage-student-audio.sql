-- 学生 Interview 音频：Storage 私有桶（dev 用）
-- 用途：Node 后端把学生 webm 音频上传到这里，并在 eval_data 中保存 audioStoragePath，供教师端下载评测。

-- 1) 创建桶
insert into storage.buckets (id, name, public)
values ('student-audio', 'student-audio', false)
on conflict (id) do nothing;

