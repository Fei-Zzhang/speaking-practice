require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
// 与 standalone 中 API_NODE（默认 3003）、server/.env 保持一致，避免与常见 3000 端口冲突
const PORT = process.env.PORT || 3003;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('请配置 .env 中的 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

/** 将 Supabase/PostgREST 错误拼成可读字符串，便于前端显示与排查 */
function formatSupabaseError(err) {
  if (!err || typeof err !== 'object') return '';
  const parts = [err.message, err.details, err.hint].filter(Boolean);
  return parts.join(' · ');
}

/** 题目 questionId（如 topic-xxx）与按序的 q0/q1 可能不一致；合并别名，学生/教师端都能命中同一条 eval_data */
function mergeSubmissionQuestionAliases(byQ, items) {
  const base = { ...(byQ || {}) };
  const merged = { ...base };
  const itemsArr = Array.isArray(items) ? items : [];
  itemsArr.forEach((it, idx) => {
    const pid = it && it.questionId ? String(it.questionId).trim() : '';
    const qk = `q${idx}`;
    const a = pid ? base[pid] : null;
    const b = base[qk];
    const pick = a || b;
    if (!pick) return;
    if (pid) merged[pid] = pick;
    merged[qk] = pick;
  });
  return merged;
}

function buildAssignmentQuestionKey(it, idx) {
  const mode = it && it.mode ? String(it.mode).trim() : '';
  const cat = it && it.categoryId ? String(it.categoryId).trim() : '';
  const qid = it && it.questionId ? String(it.questionId).trim() : '';
  const i = idx != null && isFinite(idx) ? String(idx) : '';
  return [mode, cat, qid, i].join('|');
}

function evalDataLooksComplete(ed) {
  return (
    ed &&
    typeof ed === 'object' &&
    (ed.ok === true ||
      typeof ed.overall === 'number' ||
      !!ed.correctedTranscript ||
      !!ed.transcript ||
      (Array.isArray(ed.grammarItems) && ed.grammarItems.length))
  );
}

/**
 * 学生 Interview 录音：优先写入 Supabase Storage，避免数据库中 audio_b64/ref_text 列未迁移导致写入失败。
 * eval_data 中保存：audioStoragePath、audioBucket、refText
 */
const STUDENT_AUDIO_BUCKET = (process.env.STUDENT_AUDIO_BUCKET || 'student-audio').trim();

function sanitizeStoragePathSegment(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function uploadStudentAudioToStorage(assignmentId, studentUsername, questionId, audioB64) {
  const b64 = typeof audioB64 === 'string' ? audioB64 : '';
  const buf = Buffer.from(b64, 'base64');
  const bucket = STUDENT_AUDIO_BUCKET;
  const qid = sanitizeStoragePathSegment(questionId);
  const storagePath = `${assignmentId}/${encodeURIComponent(studentUsername)}/${qid}.webm`;
  const { error: stErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buf, { contentType: 'audio/webm', upsert: true });
  return { bucket, storagePath, error: stErr };
}

// 教师首次注册需在登录请求中携带 teacherCode，且与本变量一致（不配则无法新注册教师）
const TEACHER_REGISTER_SECRET = (process.env.TEACHER_REGISTER_SECRET || '').trim();

// 学生端统一登录账号（与前端一致；可在 .env 覆盖）
const STUDENT_PORTAL_USERNAME = (process.env.STUDENT_PORTAL_USERNAME || 'studentaccount').trim();
const STUDENT_PORTAL_PASSWORD = (process.env.STUDENT_PORTAL_PASSWORD || '45678').trim();

// Python 口语评测后端地址（给教师“批改音频”用）
const PYTHON_BASE_URL = (process.env.PYTHON_BASE_URL || 'http://localhost:5001').trim();

// 允许任意来源访问（本地开发）；部署时可改为具体前端域名
app.use(cors({ origin: true, credentials: false }));
// 学生提交录音 base64 体积较大，需放宽限制（默认约 100kb 会 413）
app.use(express.json({ limit: '40mb' }));

// 根路径：避免直接打开 localhost:3000 白屏
app.get('/', (req, res) => {
  res.type('html');
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>口语练习后端</title></head><body><h1>口语练习后端已运行</h1><p>健康检查：<a href="/api/health">/api/health</a></p><p>前端请打开 <a href="http://localhost:8080/standalone.html">http://localhost:8080/standalone.html</a></p></body></html>');
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: '口语练习后端运行中' });
});

// 登录 / 注册：学生端仅允许统一账号；教师端按原逻辑
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, expectedRole, teacherCode } = req.body || {};
    const name = (username || '').trim();
    const pwd = (password || '').trim();
    const wantRole = (expectedRole || 'student').trim() === 'teacher' ? 'teacher' : 'student';

    // ---------- 学生端：仅允许 STUDENT_PORTAL_USERNAME / STUDENT_PORTAL_PASSWORD ----------
    if (wantRole === 'student') {
      if (!pwd) {
        return res.status(400).json({ ok: false, message: '请输入密码' });
      }
      if (name !== STUDENT_PORTAL_USERNAME) {
        return res.status(403).json({
          ok: false,
          message:
            '学生端账号须为「' +
            STUDENT_PORTAL_USERNAME +
            '」（与前端只读框一致）。若你改过 server/.env 的 STUDENT_PORTAL_USERNAME，请与前端 standalone.html 中的 STUDENT_PORTAL_USERNAME 保持一致。',
        });
      }
      if (pwd !== STUDENT_PORTAL_PASSWORD) {
        return res.status(403).json({
          ok: false,
          message:
            '密码错误。须与服务器配置 STUDENT_PORTAL_PASSWORD 一致（未配置时默认为 45678）。请检查 server/.env 是否改过密码，或确认输入无多余空格。',
        });
      }
      const { data: user, error: findErr } = await supabase
        .from('users')
        .select('id, username, password, role')
        .eq('username', STUDENT_PORTAL_USERNAME)
        .maybeSingle();
      if (findErr) {
        console.error('登录查询失败', findErr);
        return res.status(500).json({ ok: false, message: '服务器错误：' + (findErr.message || String(findErr)) });
      }
      if (!user) {
        const { data: newUser, error: insertErr } = await supabase
          .from('users')
          .insert({
            username: STUDENT_PORTAL_USERNAME,
            password: STUDENT_PORTAL_PASSWORD,
            role: 'student',
          })
          .select('username, role')
          .single();
        if (insertErr) {
          console.error('注册失败', insertErr);
          return res.status(500).json({ ok: false, message: '注册失败：' + (insertErr.message || String(insertErr)) });
        }
        return res.json({ ok: true, username: newUser.username, role: newUser.role || 'student', isNew: true });
      }
      if (user.password !== STUDENT_PORTAL_PASSWORD) {
        return res.status(401).json({ ok: false, message: '密码错误' });
      }
      const dbRole = user.role || 'student';
      if (dbRole !== 'student') {
        return res.status(403).json({ ok: false, message: '该账号不可用' });
      }
      return res.json({ ok: true, username: user.username, role: dbRole });
    }

    // ---------- 教师端 ----------
    if (!name) {
      return res.status(400).json({ ok: false, message: '请输入用户名' });
    }
    if (!pwd) {
      return res.status(400).json({ ok: false, message: '请输入密码' });
    }
    const { data: user, error: findErr } = await supabase
      .from('users')
      .select('id, username, password, role')
      .eq('username', name)
      .maybeSingle();
    if (findErr) {
      console.error('登录查询失败', findErr);
      return res.status(500).json({ ok: false, message: '服务器错误：' + (findErr.message || String(findErr)) });
    }
    if (!user) {
      if (!TEACHER_REGISTER_SECRET || (teacherCode || '').trim() !== TEACHER_REGISTER_SECRET) {
        return res.status(400).json({
          ok: false,
          message: '教师账号需正确填写注册口令；请在 .env 配置 TEACHER_REGISTER_SECRET。',
        });
      }
      const { data: newUser, error: insertErr } = await supabase
        .from('users')
        .insert({ username: name, password: pwd, role: 'teacher' })
        .select('username, role')
        .single();
      if (insertErr) {
        console.error('注册失败', insertErr);
        return res.status(500).json({ ok: false, message: '注册失败：' + (insertErr.message || String(insertErr)) });
      }
      return res.json({ ok: true, username: newUser.username, role: newUser.role || 'teacher', isNew: true });
    }
    if (user.password !== pwd) {
      return res.status(401).json({ ok: false, message: '密码错误' });
    }
    const dbRole = user.role || 'student';
    if (dbRole !== 'teacher') {
      const msg =
        dbRole === 'teacher'
          ? '该账号为教师账号，请从「教师端」入口登录。'
          : '该账号为学生账号，请从「学生端」入口登录。';
      return res.status(403).json({ ok: false, message: msg });
    }
    res.json({ ok: true, username: user.username, role: dbRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// 提交练习记录（选择题 + 口语文本）
app.post('/api/practice', async (req, res) => {
  try {
    const { username, sectionId, sectionTitle, mcqAnswers, mcqScore, speakingText } = req.body || {};
    if (!username || !sectionId) {
      return res.status(400).json({ ok: false, message: '缺少 username 或 sectionId' });
    }
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();
    if (userErr || !user) {
      return res.status(401).json({ ok: false, message: '用户不存在，请先登录' });
    }
    const { data: record, error: insertErr } = await supabase
      .from('practice_records')
      .insert({
        user_id: user.id,
        username: username.trim(),
        section_id: sectionId,
        section_title: sectionTitle || sectionId,
        mcq_answers: mcqAnswers || {},
        mcq_score: mcqScore != null ? mcqScore : null,
        speaking_text: speakingText || '',
      })
      .select('id')
      .single();
    if (insertErr) {
      console.error(insertErr);
      return res.status(500).json({ ok: false, message: '保存失败' });
    }
    res.json({ ok: true, id: record.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '保存失败' });
  }
});

// 查询某用户的练习记录（可选）
app.get('/api/practice', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ ok: false, message: '需要 username' });
    }
    const { data: list, error } = await supabase
      .from('practice_records')
      .select('*')
      .eq('username', username)
      .order('submitted_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    res.json({ ok: true, list: list || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

function parseStudentUsernames(raw) {
  if (!raw) return [];
  const s = String(raw);
  return [...new Set(s.split(/[\s,，;；\n\r]+/).map((x) => x.trim()).filter(Boolean))];
}

/** 学生端 API：query 里 username 或 studentName 均为「教师布置时填写的学生姓名」 */
function studentApiName(req) {
  const q = req.query || {};
  return (q.username || q.studentName || '').trim();
}

// ---------- 教师：布置任务 ----------
app.get('/api/teacher/assignments', async (req, res) => {
  try {
    const username = (req.query.username || '').trim();
    if (!username) return res.status(400).json({ ok: false, message: '需要 username' });
    const { data: rows, error } = await supabase
      .from('assignments')
      .select('id, title, items, created_at')
      .eq('teacher_username', username)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    const list = (rows || []).map((r) => ({
      id: r.id,
      title: r.title,
      itemCount: Array.isArray(r.items) ? r.items.length : 0,
      createdAt: r.created_at,
    }));
    res.json({ ok: true, list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

app.post('/api/teacher/assignments', async (req, res) => {
  try {
    const { teacherUsername, title, items, students } = req.body || {};
    const tname = (teacherUsername || '').trim();
    if (!tname) return res.status(400).json({ ok: false, message: '缺少 teacherUsername' });
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('username', tname)
      .maybeSingle();
    if (userErr || !user || (user.role || 'student') !== 'teacher') {
      return res.status(403).json({ ok: false, message: '仅教师可布置任务' });
    }
    const itemList = Array.isArray(items) ? items : [];
    if (!itemList.length) return res.status(400).json({ ok: false, message: '请至少选择一道题' });
    const titleTrim = (title || '').trim();
    if (!titleTrim) return res.status(400).json({ ok: false, message: '请填写任务名称' });
    const studentList = Array.isArray(students) ? students.map((x) => String(x).trim()).filter(Boolean) : parseStudentUsernames(students);
    if (!studentList.length) return res.status(400).json({ ok: false, message: '请填写至少一名学生姓名' });

    const { data: ins, error: insErr } = await supabase
      .from('assignments')
      .insert({
        teacher_username: tname,
        title: titleTrim,
        items: itemList,
      })
      .select('id')
      .single();
    if (insErr || !ins) {
      console.error(insErr);
      return res.status(500).json({ ok: false, message: '创建任务失败' });
    }
    const aid = ins.id;
    const targets = studentList.map((student_username) => ({ assignment_id: aid, student_username }));
    const { error: tErr } = await supabase.from('assignment_targets').insert(targets);
    if (tErr) {
      console.error(tErr);
      await supabase.from('assignments').delete().eq('id', aid);
      return res.status(500).json({ ok: false, message: '保存学生名单失败' });
    }
    res.json({ ok: true, id: aid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '创建失败' });
  }
});

app.delete('/api/teacher/assignments/:id', async (req, res) => {
  try {
    const username = (req.query.username || '').trim();
    const id = req.params.id;
    if (!username || !id) return res.status(400).json({ ok: false, message: '参数不全' });
    const { data: row, error: fErr } = await supabase
      .from('assignments')
      .select('id, teacher_username')
      .eq('id', id)
      .maybeSingle();
    if (fErr || !row || row.teacher_username !== username) {
      return res.status(403).json({ ok: false, message: '无权删除' });
    }
    const { error: dErr } = await supabase.from('assignments').delete().eq('id', id);
    if (dErr) return res.status(500).json({ ok: false, message: '删除失败' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '删除失败' });
  }
});

// ---------- 教师：查看某任务的学生提交反馈 ----------
app.get('/api/teacher/assignments/:id', async (req, res) => {
  try {
    const teacherUsername = (req.query.username || '').trim();
    const id = req.params.id;
    if (!teacherUsername || !id) {
      return res.status(400).json({ ok: false, message: '参数不全' });
    }

    const { data: row, error: aErr } = await supabase
      .from('assignments')
      .select('id, title, items, created_at, teacher_username')
      .eq('id', id)
      .maybeSingle();

    if (aErr || !row || row.teacher_username !== teacherUsername) {
      return res.status(403).json({ ok: false, message: '无权查看该任务' });
    }

    const { data: targets, error: tErr } = await supabase
      .from('assignment_targets')
      .select('student_username')
      .eq('assignment_id', id);

    if (tErr) {
      console.error(tErr);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }

    const students = [...new Set((targets || []).map((t) => t.student_username).filter(Boolean))];
    const subsMap = {};
    students.forEach((u) => {
      subsMap[u] = { username: u, submissionsByQuestion: {} };
    });

    const { data: subs, error: sErr } = await supabase
      .from('student_submissions')
      .select('student_username, question_id, eval_data, submitted_at')
      .eq('assignment_id', id);

    if (sErr) {
      console.error(sErr);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }

    (subs || []).forEach((s) => {
      const uname = s.student_username;
      if (!uname || !subsMap[uname]) return;
      const ed = s.eval_data || {};
      subsMap[uname].submissionsByQuestion[s.question_id] = {
        evalData: s.eval_data,
        submittedAt: s.submitted_at,
        hasAudio: !!(ed && ed.audioStoragePath),
      };
    });

    students.forEach((u) => {
      if (!subsMap[u]) return;
      subsMap[u].submissionsByQuestion = mergeSubmissionQuestionAliases(
        subsMap[u].submissionsByQuestion,
        row.items
      );
    });

    res.json({
      ok: true,
      assignment: {
        id: row.id,
        title: row.title,
        items: Array.isArray(row.items) ? row.items : [],
        createdAt: row.created_at,
        teacherUsername: row.teacher_username,
      },
      students: students.map((u) => subsMap[u]),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

// ---------- 学生：我的任务（username / studentName 均为「教师布置时填写的学生姓名」）----------
app.get('/api/student/assignments', async (req, res) => {
  try {
    const username = studentApiName(req);
    if (!username) return res.status(400).json({ ok: false, message: '需要学生姓名（参数 username 或 studentName）' });
    const { data: targets, error: tErr } = await supabase
      .from('assignment_targets')
      .select('assignment_id')
      .eq('student_username', username);
    if (tErr) {
      console.error(tErr);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    const ids = [...new Set((targets || []).map((x) => x.assignment_id))];
    if (!ids.length) return res.json({ ok: true, list: [] });

    const { data: rows, error: aErr } = await supabase
      .from('assignments')
      .select('id, title, items, created_at')
      .in('id', ids)
      .order('created_at', { ascending: false });
    if (aErr) {
      console.error(aErr);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }

    const { data: subs, error: sErr } = await supabase
      .from('student_submissions')
      .select('assignment_id, question_id, eval_data')
      .eq('student_username', username);
    if (sErr) {
      console.error(sErr);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    const subEvalByKey = {};
    (subs || []).forEach((s) => {
      const k = `${s.assignment_id}::${s.question_id}`;
      subEvalByKey[k] = s.eval_data || {};
    });

    const list = (rows || []).map((r) => {
      const arr = Array.isArray(r.items) ? r.items : [];
      let done = 0;
      arr.forEach(function (it, idx) {
        const qid = it && it.questionId ? String(it.questionId) : 'q' + idx;
        const uid = buildAssignmentQuestionKey(it, idx);
        const k1 = `${r.id}::${qid}`;
        const k2 = `${r.id}::${uid}`;
        const ed1 = subEvalByKey[k1];
        const ed2 = subEvalByKey[k2];
        if (evalDataLooksComplete(ed1) || evalDataLooksComplete(ed2)) done += 1;
      });
      return {
        id: r.id,
        title: r.title,
        itemCount: arr.length,
        doneCount: done,
        createdAt: r.created_at,
      };
    });
    res.json({ ok: true, list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

app.get('/api/student/assignments/:id', async (req, res) => {
  try {
    const username = studentApiName(req);
    const id = req.params.id;
    if (!username || !id) return res.status(400).json({ ok: false, message: '参数不全（需学生姓名 username 或 studentName）' });
    const { data: t, error: tErr } = await supabase
      .from('assignment_targets')
      .select('assignment_id')
      .eq('assignment_id', id)
      .eq('student_username', username)
      .maybeSingle();
    if (tErr || !t) return res.status(403).json({ ok: false, message: '无权查看该任务' });

    const { data: row, error: aErr } = await supabase
      .from('assignments')
      .select('id, title, items, created_at, teacher_username')
      .eq('id', id)
      .maybeSingle();
    if (aErr || !row) return res.status(404).json({ ok: false, message: '任务不存在' });

    const { data: subs } = await supabase
      .from('student_submissions')
      .select('question_id, eval_data, submitted_at')
      .eq('assignment_id', id)
      .eq('student_username', username);
    const byQ = {};
    (subs || []).forEach((s) => {
      const ed = s.eval_data || {};
      byQ[s.question_id] = {
        evalData: s.eval_data,
        submittedAt: s.submitted_at,
        hasAudio: !!(ed && ed.audioStoragePath),
      };
    });

    // 题目可能用 topic 类 questionId，提交记录里却是 q0/q1：为同一题合并别名，学生端才能对上 eval_data
    const mergedByQ = mergeSubmissionQuestionAliases(byQ, row.items);

    res.json({
      ok: true,
      assignment: {
        id: row.id,
        title: row.title,
        items: Array.isArray(row.items) ? row.items : [],
        createdAt: row.created_at,
        teacherUsername: row.teacher_username,
        submissionsByQuestion: mergedByQ,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

app.post('/api/student/submit', async (req, res) => {
  try {
    const { username, studentName, assignmentId, questionId, evalData } = req.body || {};
    const uname = (username || studentName || '').trim();
    const aid = (assignmentId || '').trim();
    const qid = (questionId || '').trim();
    if (!uname || !aid || !qid) {
      return res.status(400).json({ ok: false, message: '缺少 username / assignmentId / questionId' });
    }
    const { data: t, error: tErr } = await supabase
      .from('assignment_targets')
      .select('assignment_id')
      .eq('assignment_id', aid)
      .eq('student_username', uname)
      .maybeSingle();
    if (tErr || !t) return res.status(403).json({ ok: false, message: '无权提交该任务' });

    const payload = evalData && typeof evalData === 'object' ? evalData : {};
    const { error: uErr } = await supabase.from('student_submissions').upsert(
      {
        assignment_id: aid,
        student_username: uname,
        question_id: qid,
        eval_data: payload,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id,student_username,question_id' }
    );
    if (uErr) {
      console.error(uErr);
      return res.status(500).json({ ok: false, message: '保存失败' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '保存失败' });
  }
});

// ---------- 学生：只提交音频（不做批改） ----------
app.post('/api/student/submit-audio', express.raw({ type: 'audio/*', limit: '20mb' }), async (req, res) => {
  try {
    const isRawAudio = Buffer.isBuffer(req.body);
    const bodyObj = !isRawAudio && req.body && typeof req.body === 'object' ? req.body : {};
    const q = req.query || {};
    const uname = String(bodyObj.username || bodyObj.studentName || q.username || q.studentName || '').trim();
    const aid = String(bodyObj.assignmentId || q.assignmentId || '').trim();
    const qid = String(bodyObj.questionId || q.questionId || '').trim();
    const b64 = typeof bodyObj.audioB64 === 'string' ? bodyObj.audioB64 : '';
    const rtxt = String(bodyObj.refText || q.refText || '');

    if (!uname || !aid || !qid) {
      return res.status(400).json({ ok: false, message: '缺少 username / assignmentId / questionId' });
    }
    if (!isRawAudio && !b64) {
      return res.status(400).json({ ok: false, message: '缺少音频（audioB64 或 audio body）' });
    }

    const { data: t, error: tErr } = await supabase
      .from('assignment_targets')
      .select('assignment_id')
      .eq('assignment_id', aid)
      .eq('student_username', uname)
      .maybeSingle();

    if (tErr || !t) return res.status(403).json({ ok: false, message: '无权提交该任务' });

    // 1) 立即评测并保存结果：音频不落库（只把 Python 的转写/批改结果写入 eval_data）
    const audioBytes = isRawAudio ? req.body : Buffer.from(b64, 'base64');

    const form = new FormData();
    // Node 18+ 内置 Blob
    const audioBlob = new Blob([audioBytes], { type: 'audio/webm' });
    form.append('audio', audioBlob, 'student-task.webm');
    form.append('refText', rtxt || '');
    form.append('evalMode', '3');

    const pyResp = await fetch(PYTHON_BASE_URL + '/api/asr-eval', {
      method: 'POST',
      body: form,
    });
    const pyData = await pyResp.json().catch(() => ({}));
    if (!pyResp.ok || !pyData || pyData.ok !== true) {
      const msg = pyData && pyData.error ? pyData.error : 'Python 批改失败';
      return res.status(500).json({ ok: false, message: msg });
    }

    const { error: uErr } = await supabase.from('student_submissions').upsert(
      {
        assignment_id: aid,
        student_username: uname,
        question_id: qid,
        eval_data: pyData,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id,student_username,question_id' }
    );

    if (uErr) {
      console.error('submit-audio upsert', uErr);
      const detail = formatSupabaseError(uErr);
      return res.status(500).json({
        ok: false,
        message: detail ? '保存失败：' + detail : '保存失败（数据库写入失败）',
      });
    }
    res.json({ ok: true, evalData: pyData });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      message: '保存失败：' + (err && err.message ? err.message : String(err)),
    });
  }
});

// ---------- 教师：批改学生某题（只允许 zhangyufei） ----------
app.post('/api/teacher/evaluate-submission', async (req, res) => {
  try {
    const { teacherUsername, assignmentId, studentUsername, questionId } = req.body || {};
    const teacher = (teacherUsername || '').trim();
    const aid = (assignmentId || '').trim();
    const suser = (studentUsername || '').trim();
    const qid = (questionId || '').trim();

    if (!teacher || !aid || !suser || !qid) {
      return res.status(400).json({ ok: false, message: '缺少 teacherUsername / assignmentId / studentUsername / questionId' });
    }
    if (teacher !== 'zhangyufei') {
      return res.status(403).json({ ok: false, message: '仅 zhangyufei 可进行批改' });
    }

    // 任务须存在；zhangyufei 作为指定批改账号，可批改任意教师下发的任务
    const { data: assignmentRow, error: aErr } = await supabase
      .from('assignments')
      .select('id')
      .eq('id', aid)
      .maybeSingle();
    if (aErr || !assignmentRow) {
      return res.status(404).json({ ok: false, message: '任务不存在' });
    }

    const { data: subRow, error: sErr } = await supabase
      .from('student_submissions')
      .select('eval_data, submitted_at')
      .eq('assignment_id', aid)
      .eq('student_username', suser)
      .eq('question_id', qid)
      .maybeSingle();

    if (sErr || !subRow) {
      return res.status(404).json({ ok: false, message: '提交记录不存在' });
    }
    const ed = subRow.eval_data || {};
    const hasEval =
      ed &&
      typeof ed === 'object' &&
      (ed.ok === true ||
        !!ed.correctedTranscript ||
        !!ed.transcript ||
        (Array.isArray(ed.grammarItems) && ed.grammarItems.length));

    // 学生提交时已自动评测：教师再点一次直接返回成功
    if (hasEval) return res.json({ ok: true });

    // 兼容旧数据（如果你曾经把音频路径写进 eval_data）
    const audioStoragePath = ed.audioStoragePath;
    if (!audioStoragePath) {
      return res.status(400).json({
        ok: false,
        message: '该题没有可批改的音频/评测数据；请让学生重新提交该题音频。',
      });
    }

    const bucket = ed.audioBucket || STUDENT_AUDIO_BUCKET;
    const refText = ed.refText || '';

    const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(audioStoragePath);
    if (dlErr || !fileData) {
      return res.status(500).json({
        ok: false,
        message: '读取音频失败：' + formatSupabaseError(dlErr),
      });
    }

    let audioBytes;
    if (Buffer.isBuffer(fileData)) {
      audioBytes = fileData;
    } else if (fileData instanceof ArrayBuffer) {
      audioBytes = Buffer.from(fileData);
    } else if (fileData && typeof fileData.arrayBuffer === 'function') {
      audioBytes = Buffer.from(await fileData.arrayBuffer());
    } else {
      return res.status(500).json({ ok: false, message: '无法解析 Storage 返回的音频' });
    }

    const form = new FormData();
    const audioBlob = new Blob([audioBytes], { type: 'audio/webm' });
    form.append('audio', audioBlob, 'student-task.webm');
    form.append('refText', refText);
    form.append('evalMode', '3');

    const pyResp = await fetch(PYTHON_BASE_URL + '/api/asr-eval', {
      method: 'POST',
      body: form,
    });

    const pyData = await pyResp.json().catch(() => ({}));
    if (!pyResp.ok || !pyData || pyData.ok !== true) {
      const msg = pyData && pyData.error ? pyData.error : 'Python 批改失败';
      return res.status(500).json({ ok: false, message: msg });
    }

    const { error: uErr } = await supabase
      .from('student_submissions')
      .update({ eval_data: Object.assign({}, ed, pyData) })
      .eq('assignment_id', aid)
      .eq('student_username', suser)
      .eq('question_id', qid);

    if (uErr) {
      console.error(uErr);
      return res.status(500).json({ ok: false, message: '保存评测结果失败' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '批改失败' });
  }
});

if (String(process.env.POC_MODE || '').trim() === '1') {
  require('./poc-mock')(app);
  console.warn('[POC] POC_MODE=1：已挂载 /api/poc/*（内存模拟短信与支付，勿用于生产）');
}

const server = app.listen(PORT, () => {
  console.log('已连接 Supabase 云数据库');
  console.log('后端运行在 http://localhost:' + PORT);
  console.log(
    'API: auth, practice, teacher/assignments, teacher/evaluate-submission, student/assignments, student/submit, student/submit-audio' +
      (String(process.env.POC_MODE || '').trim() === '1' ? ', poc/*' : '')
  );
});

server.on('error', function (err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error('\n[错误] 端口 ' + PORT + ' 已被占用，Node 无法启动。');
    console.error('请执行：lsof -i :' + PORT + '   记下 PID，再执行：kill <PID>');
    console.error('或在 server/.env 中修改 PORT=其他端口（并同步修改前端 API_NODE）。\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
