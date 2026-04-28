require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { buildTencentRealtimeAsrUrl } = require('./tencent-asr-sign');

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

/** 与 standalone 中题目 key 规则一致：按 questionId 或 q0/q1 命中作业项，用于区分 LNR vs Interview */
function getAssignmentItemModeFromItems(items, questionId) {
  const itemsArr = Array.isArray(items) ? items : [];
  const qid = String(questionId || '').trim();
  for (let idx = 0; idx < itemsArr.length; idx++) {
    const it = itemsArr[idx];
    if (!it) continue;
    const pid = it.questionId != null ? String(it.questionId).trim() : '';
    const qk = 'q' + idx;
    if ((pid && pid === qid) || qk === qid) {
      return String(it.mode || '').trim() || null;
    }
  }
  return null;
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

// Python 口语评测后端地址（ASR/批改；Listen&Repeat 与 Interview 云端评测共用）
const PYTHON_BASE_URL = (process.env.PYTHON_BASE_URL || 'http://localhost:5001').trim();

/** 腾讯云实时语音识别（WebSocket）— 与 oral-python-backend 可共用同一套 ASR 密钥；AppID 见控制台 API 密钥管理 */
const TENCENT_ASR_APP_ID = (process.env.TENCENT_ASR_APP_ID || process.env.TENCENT_APP_ID || '').trim();
const TENCENT_ASR_SECRET_ID = (process.env.TENCENT_ASR_SECRET_ID || '').trim();
const TENCENT_ASR_SECRET_KEY = (process.env.TENCENT_ASR_SECRET_KEY || '').trim();

/** 学生自助注册：用户名长度与字符限制（与前端一致） */
function isValidStudentRegisterUsername(name) {
  const s = String(name || '').trim();
  if (s.length < 2 || s.length > 48) return false;
  return /^[\u4e00-\u9fa5a-zA-Z0-9._-]+$/.test(s);
}

function isValidStudentRegisterPassword(pwd) {
  const s = String(pwd || '');
  return s.length >= 4 && s.length <= 128;
}

async function getStudentInterviewApproval(username) {
  const uname = String(username || '').trim();
  if (!uname) return { ok: false, approved: false };
  const { data: user, error } = await supabase
    .from('users')
    .select('role, interview_grading_approved')
    .eq('username', uname)
    .maybeSingle();
  if (error || !user) return { ok: false, approved: false };
  if ((user.role || 'student') !== 'student') return { ok: true, approved: false };
  return { ok: true, approved: !!user.interview_grading_approved };
}

/**
 * Interview 腾讯云实时流式 ASR：教师可用；学生端凡已登录学生均可（与「实时转写」第一步一致，不计费见腾讯云文档）。
 * 经 Node 转发的整段录音批改已统一走 Python /api/upload-audio-correct（长音频 ASR + TokenHub，与主站「上传」同路），仍受 interview_grading_approved 控制。
 */
async function getTencentStreamEligibility(username) {
  const uname = String(username || '').trim();
  if (!uname) return { ok: false, message: '需要 username' };
  const { data: user, error } = await supabase
    .from('users')
    .select('role, interview_grading_approved')
    .eq('username', uname)
    .maybeSingle();
  if (error || !user) return { ok: false, message: '用户不存在' };
  const role = user.role || 'student';
  if (role === 'teacher') return { ok: true };
  if (role === 'student') return { ok: true };
  return { ok: false, message: '无效用户' };
}

/** 学生 Interview 实时转写同步到教师端（内存；单实例有效，多实例需 Redis） */
const liveInterviewTranscripts = new Map();
const LIVE_TRANSCRIPT_TTL_MS = 15 * 60 * 1000;

/** 持久化到 Supabase（与 Render 多实例 / 教师轮询读库一致） */
async function persistInterviewTranscriptToDb(uname, row) {
  const payload = {
    student_username: uname,
    text: row.text,
    source: row.source ? String(row.source).slice(0, 128) : null,
    assignment_id: row.assignmentId ? String(row.assignmentId).slice(0, 128) : null,
    question_id: row.questionId ? String(row.questionId).slice(0, 256) : null,
    updated_at: new Date().toISOString(),
  };
  const { error: upErr } = await supabase.from('interview_live_transcripts').upsert(payload);
  if (!upErr) return { ok: true };
  console.warn('[interview-live-transcript] upsert:', formatSupabaseError(upErr));
  const { data: updated, error: updErr } = await supabase
    .from('interview_live_transcripts')
    .update({
      text: payload.text,
      source: payload.source,
      assignment_id: payload.assignment_id,
      question_id: payload.question_id,
      updated_at: payload.updated_at,
    })
    .eq('student_username', uname)
    .select('student_username');
  if (!updErr && updated && updated.length) return { ok: true };
  if (updErr) console.warn('[interview-live-transcript] update:', formatSupabaseError(updErr));
  const { error: insErr } = await supabase.from('interview_live_transcripts').insert(payload);
  if (insErr) {
    console.warn('[interview-live-transcript] insert:', formatSupabaseError(insErr));
    return { ok: false, error: formatSupabaseError(insErr) };
  }
  return { ok: true };
}

function pruneLiveInterviewTranscripts() {
  const now = Date.now();
  for (const [k, v] of liveInterviewTranscripts) {
    if (now - (v.updatedAt || 0) > LIVE_TRANSCRIPT_TTL_MS) liveInterviewTranscripts.delete(k);
  }
}

// 允许任意来源访问（本地开发）；部署时可改为具体前端域名
app.use(cors({ origin: true, credentials: false }));
// 学生提交录音 base64 体积较大，需放宽限制（默认约 100kb 会 413）
app.use(express.json({ limit: '80mb' }));

// 根路径：避免直接打开 localhost:3000 白屏
app.get('/', (req, res) => {
  res.type('html');
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>口语练习后端</title></head><body><h1>口语练习后端已运行</h1><p>健康检查：<a href="/api/health">/api/health</a></p><p>前端请打开 <a href="http://localhost:8080/standalone.html">http://localhost:8080/standalone.html</a></p></body></html>');
});

// 健康检查；加 ?checkDb=1 可验证 interview_live_transcripts 表是否可被服务端读写（需已执行 supabase-interview-live-transcript.sql）
app.get('/api/health', async (req, res) => {
  const out = { ok: true, message: '口语练习后端运行中' };
  if (req.query.checkDb === '1') {
    try {
      const { error, count } = await supabase
        .from('interview_live_transcripts')
        .select('*', { count: 'exact', head: true });
      out.interview_live_transcripts = error
        ? { ok: false, error: formatSupabaseError(error) }
        : { ok: true, rowCount: count != null ? count : 0 };
    } catch (e) {
      out.interview_live_transcripts = { ok: false, error: String(e && e.message) };
    }
  }
  res.json(out);
});

/**
 * 签发腾讯云「实时语音识别」WebSocket URL（浏览器直连 wss://asr.cloud.tencent.com）
 * 鉴权与计费见腾讯云文档；凡已注册学生/教师均可申请签名（与云端批改开通无关）。
 */
app.get('/api/tencent-asr/sign', async (req, res) => {
  try {
    const username = (req.query.username || '').trim();
    const engineModelType = (req.query.engine_model_type || '16k_en').trim();
    const elig = await getTencentStreamEligibility(username);
    if (!elig.ok) {
      return res.status(403).json({ ok: false, message: elig.message });
    }
    if (!TENCENT_ASR_APP_ID || !TENCENT_ASR_SECRET_ID || !TENCENT_ASR_SECRET_KEY) {
      return res.status(503).json({
        ok: false,
        message:
          '服务端未配置 TENCENT_ASR_APP_ID、TENCENT_ASR_SECRET_ID、TENCENT_ASR_SECRET_KEY（可与 oral-python-backend/.env 中 ASR 密钥一致，见 server/.env.example）',
      });
    }
    const { url, voiceId } = buildTencentRealtimeAsrUrl(
      TENCENT_ASR_APP_ID,
      TENCENT_ASR_SECRET_ID,
      TENCENT_ASR_SECRET_KEY,
      { engine_model_type: engineModelType }
    );
    res.json({ ok: true, url, voiceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

/** 学生端上报 Interview 实时转写片段（供教师轮询）；需在线登录密码 */
app.post('/api/student/interview-live-transcript', async (req, res) => {
  try {
    pruneLiveInterviewTranscripts();
    const { username, password, text, source, assignmentId, questionId } = req.body || {};
    const uname = String(username || '').trim();
    const pwd = String(password || '');
    if (!uname || !pwd) return res.status(400).json({ ok: false, message: '需要 username 与 password' });
    const { data: user, error } = await supabase
      .from('users')
      .select('username, password, role')
      .eq('username', uname)
      .maybeSingle();
    if (error || !user) return res.status(401).json({ ok: false, message: '用户不存在' });
    if ((user.role || 'student') !== 'student') return res.status(403).json({ ok: false, message: '仅学生可上报' });
    if (user.password !== pwd) return res.status(401).json({ ok: false, message: '密码错误' });
    const t = String(text || '');
    const row = {
      text: t.slice(0, 120000),
      source: String(source || '').slice(0, 32),
      assignmentId: assignmentId ? String(assignmentId).slice(0, 64) : '',
      questionId: questionId ? String(questionId).slice(0, 128) : '',
      updatedAt: Date.now(),
    };
    liveInterviewTranscripts.set(uname, row);
    try {
      const dbRes = await persistInterviewTranscriptToDb(uname, row);
      if (!dbRes.ok) {
        console.warn('[interview-live-transcript] DB 未写入，教师端可能仍读不到。请确认 Supabase 已执行 sql、且 Render 的 SUPABASE_* 与执行 SQL 的项目一致。');
      }
    } catch (e) {
      console.warn('[interview-live-transcript] persist failed', e);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

/**
 * 教师查询某学生的最新实时转写（内存）。请用 POST，避免密码出现在 URL。
 * 已验证教师身份后，可查看任意注册学生（与是否布置作业无关）。
 */
app.post('/api/teacher/interview-live-transcript', async (req, res) => {
  try {
    pruneLiveInterviewTranscripts();
    const body = req.body || {};
    const teacherUsername = String(body.teacherUsername || body.username || '').trim();
    const teacherPassword = String(body.password || '').trim();
    const studentUsername = String(body.studentUsername || body.student || '').trim();
    if (!teacherUsername || !teacherPassword || !studentUsername) {
      return res.status(400).json({ ok: false, message: '需要 teacherUsername、password、studentUsername' });
    }
    const { data: teacher, error: te } = await supabase
      .from('users')
      .select('username, password, role')
      .eq('username', teacherUsername)
      .maybeSingle();
    if (te || !teacher) return res.status(401).json({ ok: false, message: '教师账号不存在' });
    if ((teacher.role || 'student') !== 'teacher') return res.status(403).json({ ok: false, message: '仅教师可查看' });
    if (teacher.password !== teacherPassword) return res.status(401).json({ ok: false, message: '密码错误' });

    const { data: stu, error: suErr } = await supabase
      .from('users')
      .select('username, role')
      .eq('username', studentUsername)
      .maybeSingle();
    if (suErr || !stu) return res.status(404).json({ ok: false, message: '学生不存在' });
    if ((stu.role || 'student') !== 'student') return res.status(403).json({ ok: false, message: '仅可查看学生账号' });

    let live = liveInterviewTranscripts.get(studentUsername) || null;
    try {
      const { data: dbRow, error: dbErr } = await supabase
        .from('interview_live_transcripts')
        .select('text, source, assignment_id, question_id, updated_at')
        .eq('student_username', studentUsername)
        .maybeSingle();
      if (dbErr) {
        console.warn('[teacher interview-live-transcript] db select:', formatSupabaseError(dbErr));
      } else if (dbRow && dbRow.updated_at) {
        const dbMs = new Date(dbRow.updated_at).getTime();
        const memMs = live && live.updatedAt ? live.updatedAt : 0;
        if (!live || dbMs >= memMs) {
          live = {
            text: dbRow.text || '',
            source: dbRow.source || '',
            assignmentId: dbRow.assignment_id || '',
            questionId: dbRow.question_id || '',
            updatedAt: dbMs,
          };
        }
      }
    } catch (e) {
      console.warn('[teacher interview-live-transcript] db read', e);
    }
    res.json({
      ok: true,
      live: live
        ? {
            text: live.text,
            source: live.source,
            assignmentId: live.assignmentId || null,
            questionId: live.questionId || null,
            updatedAt: live.updatedAt,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

/** 北京时间「今天」0 点～次日 0 点（与 TIMESTAMPTZ 比较用 ISO） */
function getShanghaiDayBoundsUtc() {
  const tz = 'Asia/Shanghai';
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  const dayStr = `${y}-${m}-${d}`;
  const start = new Date(`${dayStr}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString(), label: dayStr };
}

function previewEvalDataText(ed) {
  if (!ed || typeof ed !== 'object') return '';
  const o = ed;
  const s =
    (o.correctedTranscript && String(o.correctedTranscript).trim()) ||
    (o.transcript && String(o.transcript).trim()) ||
    (o.asrPlainNoPunct && String(o.asrPlainNoPunct).trim()) ||
    '';
  if (s) return s.slice(0, 12000);
  try {
    return JSON.stringify(o).slice(0, 800);
  } catch (_) {
    return '';
  }
}

/**
 * 教师查看「今天」（北京时间）内、本人布置任务下所有学生的作业提交（来自 student_submissions，与保存同步）。
 * POST body: teacherUsername, password
 */
app.post('/api/teacher/today-submissions', async (req, res) => {
  try {
    const { teacherUsername, password } = req.body || {};
    const t = String(teacherUsername || '').trim();
    const pwd = String(password || '');
    if (!t || !pwd) return res.status(400).json({ ok: false, message: '需要 teacherUsername 与 password' });
    const { data: teacher, error: te } = await supabase
      .from('users')
      .select('username, password, role')
      .eq('username', t)
      .maybeSingle();
    if (te || !teacher) return res.status(401).json({ ok: false, message: '教师账号不存在' });
    if ((teacher.role || 'student') !== 'teacher') return res.status(403).json({ ok: false, message: '仅教师可查看' });
    if (teacher.password !== pwd) return res.status(401).json({ ok: false, message: '密码错误' });

    const { data: assignRows, error: aErr } = await supabase.from('assignments').select('id, title').eq('teacher_username', t);
    if (aErr) {
      console.error(aErr);
      return res.status(500).json({ ok: false, message: '查询任务失败' });
    }
    const assignments = assignRows || [];
    const idToTitle = {};
    const ids = [];
    assignments.forEach((a) => {
      idToTitle[a.id] = a.title || '';
      ids.push(a.id);
    });
    const { startISO, endISO, label } = getShanghaiDayBoundsUtc();
    if (!ids.length) {
      return res.json({ ok: true, dayLabel: label, records: [] });
    }

    const { data: subs, error: sErr } = await supabase
      .from('student_submissions')
      .select('assignment_id, student_username, question_id, eval_data, submitted_at')
      .in('assignment_id', ids)
      .gte('submitted_at', startISO)
      .lt('submitted_at', endISO)
      .order('submitted_at', { ascending: false })
      .limit(300);
    if (sErr) {
      console.error(sErr);
      return res.status(500).json({ ok: false, message: '查询提交记录失败' });
    }

    const records = (subs || []).map((s) => ({
      assignmentId: s.assignment_id,
      assignmentTitle: idToTitle[s.assignment_id] || '',
      studentUsername: s.student_username,
      questionId: s.question_id,
      submittedAt: s.submitted_at,
      textPreview: previewEvalDataText(s.eval_data),
    }));

    res.json({ ok: true, dayLabel: label, records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// 学生自助注册（门户：用户名即身份，与教师布置时填写的学生姓名一致）
app.post('/api/auth/register-student', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const name = (username || '').trim();
    const pwd = (password || '').trim();
    if (!isValidStudentRegisterUsername(name)) {
      return res.status(400).json({
        ok: false,
        message: '用户名需 2～48 字，仅支持中文、字母、数字、._-',
      });
    }
    if (!isValidStudentRegisterPassword(pwd)) {
      return res.status(400).json({ ok: false, message: '密码长度需在 4～128 位之间' });
    }
    const { data: exists, error: findErr } = await supabase
      .from('users')
      .select('username')
      .eq('username', name)
      .maybeSingle();
    if (findErr) {
      console.error('register-student 查询失败', findErr);
      return res.status(500).json({ ok: false, message: '服务器错误：' + (findErr.message || String(findErr)) });
    }
    if (exists) {
      return res.status(409).json({ ok: false, message: '该用户名已被注册' });
    }
    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert({
        username: name,
        password: pwd,
        role: 'student',
      })
      .select('username, role')
      .single();
    if (insertErr) {
      console.error('register-student 插入失败', insertErr);
      const detail = formatSupabaseError(insertErr);
      return res.status(500).json({
        ok: false,
        message: detail ? '注册失败：' + detail : '注册失败（请确认已执行 supabase-portal-student-v1.sql 增加 interview_grading_approved）',
      });
    }
    return res.json({
      ok: true,
      username: newUser.username,
      role: newUser.role || 'student',
      interviewGradingApproved: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// 登录 / 注册：学生端按用户名+密码；教师端按原逻辑
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, expectedRole, teacherCode } = req.body || {};
    const name = (username || '').trim();
    const pwd = (password || '').trim();
    const wantRole = (expectedRole || 'student').trim() === 'teacher' ? 'teacher' : 'student';

    // ---------- 学生端：已注册学生账号 ----------
    if (wantRole === 'student') {
      if (!name) {
        return res.status(400).json({ ok: false, message: '请输入用户名' });
      }
      if (!pwd) {
        return res.status(400).json({ ok: false, message: '请输入密码' });
      }
      const { data: user, error: findErr } = await supabase
        .from('users')
        .select('id, username, password, role, interview_grading_approved')
        .eq('username', name)
        .maybeSingle();
      if (findErr) {
        console.error('登录查询失败', findErr);
        return res.status(500).json({ ok: false, message: '服务器错误：' + (findErr.message || String(findErr)) });
      }
      if (!user) {
        return res.status(401).json({ ok: false, message: '用户名或密码错误；若尚未注册请先注册' });
      }
      if (user.password !== pwd) {
        return res.status(401).json({ ok: false, message: '用户名或密码错误' });
      }
      const dbRole = user.role || 'student';
      if (dbRole !== 'student') {
        return res.status(403).json({ ok: false, message: '该账号为教师账号，请从教师端入口登录' });
      }
      return res.json({
        ok: true,
        username: user.username,
        role: dbRole,
        interviewGradingApproved: !!user.interview_grading_approved,
      });
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

// ---------- 班级 + 学生入班 + 录音打卡（AI 与 /api/upload-audio-correct 同源，成本见 CLASSROOM_CHECKIN_DAILY_LIMIT）----------
const CLASSROOM_CHECKIN_DAILY_LIMIT = Math.min(
  500,
  Math.max(0, parseInt(String(process.env.CLASSROOM_CHECKIN_DAILY_LIMIT || '5').trim(), 10) || 0)
);
/** 0 = 不限制；否则按每个学生在每个班「UTC 自然日」内打卡次数 */

function startOfUtcDayIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function userHasRole(username, role) {
  const u = String(username || '').trim();
  if (!u) return false;
  const { data, error } = await supabase.from('users').select('role').eq('username', u).maybeSingle();
  if (error || !data) return false;
  return (data.role || 'student') === role;
}

/** 公开：学生浏览全部班级 */
app.get('/api/classrooms', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('classrooms')
      .select('id, name, description, teacher_username, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    res.json({ ok: true, list: data || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

app.get('/api/teacher/classrooms', async (req, res) => {
  try {
    const username = (req.query.username || '').trim();
    if (!username) return res.status(400).json({ ok: false, message: '需要 username' });
    if (!(await userHasRole(username, 'teacher'))) {
      return res.status(403).json({ ok: false, message: '仅教师可查看' });
    }
    const { data, error } = await supabase
      .from('classrooms')
      .select('id, name, description, created_at, teacher_username')
      .eq('teacher_username', username)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    res.json({ ok: true, list: data || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

app.post('/api/teacher/classrooms', async (req, res) => {
  try {
    const { teacherUsername, name, description } = req.body || {};
    const t = (teacherUsername || '').trim();
    const n = (name || '').trim();
    if (!t || !n) return res.status(400).json({ ok: false, message: '需要 teacherUsername 与 name' });
    if (n.length > 80) return res.status(400).json({ ok: false, message: '班级名称过长' });
    if (!(await userHasRole(t, 'teacher'))) {
      return res.status(403).json({ ok: false, message: '仅教师可创建班级' });
    }
    const { data, error } = await supabase
      .from('classrooms')
      .insert({
        teacher_username: t,
        name: n,
        description: (description && String(description).trim()) || null,
      })
      .select('id, name, description, created_at')
      .single();
    if (error || !data) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '创建失败' });
    }
    res.json({ ok: true, classroom: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '创建失败' });
  }
});

app.delete('/api/teacher/classrooms/:id', async (req, res) => {
  try {
    const username = (req.query.username || '').trim();
    const id = (req.params.id || '').trim();
    if (!username || !id) return res.status(400).json({ ok: false, message: '参数不全' });
    if (!(await userHasRole(username, 'teacher'))) {
      return res.status(403).json({ ok: false, message: '仅教师可删除' });
    }
    const { data: row, error: fErr } = await supabase
      .from('classrooms')
      .select('id, teacher_username')
      .eq('id', id)
      .maybeSingle();
    if (fErr || !row || row.teacher_username !== username) {
      return res.status(403).json({ ok: false, message: '无权删除' });
    }
    const { error: dErr } = await supabase.from('classrooms').delete().eq('id', id);
    if (dErr) return res.status(500).json({ ok: false, message: '删除失败' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '删除失败' });
  }
});

app.get('/api/teacher/classrooms/:id/checkins', async (req, res) => {
  try {
    const teacherUsername = (req.query.username || '').trim();
    const id = (req.params.id || '').trim();
    if (!teacherUsername || !id) return res.status(400).json({ ok: false, message: '参数不全' });
    if (!(await userHasRole(teacherUsername, 'teacher'))) {
      return res.status(403).json({ ok: false, message: '仅教师可查看' });
    }
    const { data: croom, error: cErr } = await supabase
      .from('classrooms')
      .select('id, teacher_username, name')
      .eq('id', id)
      .maybeSingle();
    if (cErr || !croom || croom.teacher_username !== teacherUsername) {
      return res.status(403).json({ ok: false, message: '无权查看该班级' });
    }
    const { data: rows, error } = await supabase
      .from('classroom_checkins')
      .select('id, student_username, note, eval_data, submitted_at, teacher_feedback, teacher_feedback_at')
      .eq('classroom_id', id)
      .order('submitted_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    res.json({ ok: true, classroom: { id: croom.id, name: croom.name }, checkins: rows || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

app.post('/api/teacher/classroom-checkin-feedback', async (req, res) => {
  try {
    const { teacherUsername, checkinId, feedback } = req.body || {};
    const t = (teacherUsername || '').trim();
    const cid = (checkinId || '').trim();
    const fb = (feedback != null ? String(feedback) : '').trim();
    if (!t || !cid) return res.status(400).json({ ok: false, message: '需要 teacherUsername 与 checkinId' });
    if (!(await userHasRole(t, 'teacher'))) {
      return res.status(403).json({ ok: false, message: '仅教师可反馈' });
    }
    const { data: ch, error: chErr } = await supabase
      .from('classroom_checkins')
      .select('id, classroom_id')
      .eq('id', cid)
      .maybeSingle();
    if (chErr || !ch) {
      return res.status(404).json({ ok: false, message: '记录不存在' });
    }
    const { data: croom, error: rErr } = await supabase
      .from('classrooms')
      .select('teacher_username')
      .eq('id', ch.classroom_id)
      .maybeSingle();
    if (rErr || !croom || croom.teacher_username !== t) {
      return res.status(403).json({ ok: false, message: '无权操作该记录' });
    }
    const { error: uErr } = await supabase
      .from('classroom_checkins')
      .update({
        teacher_feedback: fb || null,
        teacher_feedback_at: new Date().toISOString(),
      })
      .eq('id', cid);
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

/** 学生已加入的班级 */
app.get('/api/student/classrooms', async (req, res) => {
  try {
    const username = (req.query.username || '').trim();
    if (!username) return res.status(400).json({ ok: false, message: '需要 username' });
    const { data: mems, error: mErr } = await supabase
      .from('classroom_members')
      .select('classroom_id, joined_at')
      .eq('student_username', username);
    if (mErr) {
      console.error(mErr);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    const ids = (mems || []).map((m) => m.classroom_id).filter(Boolean);
    if (!ids.length) {
      return res.json({ ok: true, list: [] });
    }
    const { data: rooms, error: rErr } = await supabase
      .from('classrooms')
      .select('id, name, description, teacher_username, created_at')
      .in('id', ids);
    if (rErr) {
      console.error(rErr);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
    const joinMap = new Map((mems || []).map((m) => [m.classroom_id, m.joined_at]));
    const list = (rooms || []).map((r) => ({ ...r, joinedAt: joinMap.get(r.id) || null }));
    res.json({ ok: true, list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

app.post('/api/student/classrooms/join', async (req, res) => {
  try {
    const { studentUsername, classroomId } = req.body || {};
    const s = (studentUsername || '').trim();
    const cid = (classroomId || '').trim();
    if (!s || !cid) return res.status(400).json({ ok: false, message: '需要 studentUsername 与 classroomId' });
    if (!(await userHasRole(s, 'student'))) {
      return res.status(403).json({ ok: false, message: '仅学生账号可入班' });
    }
    const { data: room, error: rErr } = await supabase
      .from('classrooms')
      .select('id')
      .eq('id', cid)
      .maybeSingle();
    if (rErr || !room) {
      return res.status(404).json({ ok: false, message: '班级不存在' });
    }
    const { error: insErr } = await supabase
      .from('classroom_members')
      .upsert({ classroom_id: cid, student_username: s }, { onConflict: 'classroom_id,student_username' });
    if (insErr) {
      console.error(insErr);
      return res.status(500).json({ ok: false, message: '入班失败' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '入班失败' });
  }
});

app.post('/api/student/classrooms/leave', async (req, res) => {
  try {
    const { studentUsername, classroomId } = req.body || {};
    const s = (studentUsername || '').trim();
    const cid = (classroomId || '').trim();
    if (!s || !cid) return res.status(400).json({ ok: false, message: '需要 studentUsername 与 classroomId' });
    if (!(await userHasRole(s, 'student'))) {
      return res.status(403).json({ ok: false, message: '仅学生可操作' });
    }
    const { error: dErr } = await supabase
      .from('classroom_members')
      .delete()
      .eq('classroom_id', cid)
      .eq('student_username', s);
    if (dErr) {
      console.error(dErr);
      return res.status(500).json({ ok: false, message: '退班失败' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '退班失败' });
  }
});

/** 上传一段音频到 Python upload-audio-correct，返回解析后的 JSON 对象；失败时抛错或返回 { error } */
async function runUploadAudioCorrectToPython(audioBuffer, contentType) {
  const bytes = audioBuffer;
  if (!Buffer.isBuffer(bytes) || bytes.length < 100) {
    return { err: '缺少有效音频' };
  }
  const mt = (contentType && String(contentType)) || 'audio/webm';
  const form = new FormData();
  const audioBlob = new Blob([bytes], { type: mt.indexOf('audio') === 0 ? mt : 'audio/webm' });
  form.append('audio', audioBlob, 'classroom-checkin.webm');
  const pyResp = await fetch(PYTHON_BASE_URL + '/api/upload-audio-correct', { method: 'POST', body: form });
  const pyData = await pyResp.json().catch(() => ({}));
  if (!pyResp.ok || !pyData || pyData.ok !== true) {
    const msg = pyData && pyData.error ? pyData.error : '评测失败';
    return { err: String(msg) };
  }
  return { data: pyData };
}

app.post(
  '/api/student/classroom-checkin',
  express.raw({ type: 'audio/*', limit: '20mb' }),
  async (req, res) => {
    try {
      const uname = (req.query.username || req.query.studentName || '').trim();
      const classroomId = (req.query.classroomId || '').trim();
      const note = String(req.query.note || '').trim().slice(0, 500);
      if (!uname || !classroomId) {
        return res.status(400).json({ ok: false, message: '需要 username 与 classroomId' });
      }
      if (!(await userHasRole(uname, 'student'))) {
        return res.status(403).json({ ok: false, message: '仅学生可打卡' });
      }
      const { data: m, error: mErr } = await supabase
        .from('classroom_members')
        .select('classroom_id')
        .eq('classroom_id', classroomId)
        .eq('student_username', uname)
        .maybeSingle();
      if (mErr || !m) {
        return res.status(403).json({ ok: false, message: '请先加入该班级再打卡' });
      }
      if (CLASSROOM_CHECKIN_DAILY_LIMIT > 0) {
        const { count, error: cErr } = await supabase
          .from('classroom_checkins')
          .select('*', { count: 'exact', head: true })
          .eq('classroom_id', classroomId)
          .eq('student_username', uname)
          .gte('submitted_at', startOfUtcDayIso());
        if (cErr) {
          console.error(cErr);
          return res.status(500).json({ ok: false, message: '次数校验失败' });
        }
        if ((count || 0) >= CLASSROOM_CHECKIN_DAILY_LIMIT) {
          return res.status(429).json({
            ok: false,
            message: `本班今日打卡已达上限（${CLASSROOM_CHECKIN_DAILY_LIMIT} 次/人，UTC 日）。可联系教师或明日再试。可在服务端设置 CLASSROOM_CHECKIN_DAILY_LIMIT。`,
          });
        }
      }
      const isRawAudio = Buffer.isBuffer(req.body);
      const bodyObj = !isRawAudio && req.body && typeof req.body === 'object' ? req.body : {};
      const b64 = typeof bodyObj.audioB64 === 'string' ? bodyObj.audioB64 : '';
      const audioBytes = isRawAudio ? req.body : b64 ? Buffer.from(b64, 'base64') : null;
      if (!audioBytes || audioBytes.length < 100) {
        return res.status(400).json({ ok: false, message: '缺少有效音频' });
      }
      const r = await runUploadAudioCorrectToPython(audioBytes, 'audio/webm');
      if (r.err) {
        return res.status(500).json({ ok: false, message: r.err });
      }
      const pyData = r.data;
      const { data: ins, error: insErr } = await supabase
        .from('classroom_checkins')
        .insert({
          classroom_id: classroomId,
          student_username: uname,
          note: note || null,
          eval_data: pyData,
        })
        .select('id, submitted_at')
        .single();
      if (insErr || !ins) {
        console.error(insErr);
        return res.status(500).json({ ok: false, message: '保存打卡失败' });
      }
      res.json({ ok: true, id: ins.id, submittedAt: ins.submitted_at, evalData: pyData });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: '打卡失败' });
    }
  }
);

/**
 * 学生 · 多文件打卡（一次请求并行评测多段录音，单条 eval_data: { multi, files: [...] }，仍计 1 次今日打卡）
 */
app.post('/api/student/classroom-checkin-batch', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const uname = String(body.username || body.studentName || '').trim();
    const classroomId = String(body.classroomId || '').trim();
    const note = String(body.note != null ? body.note : '').trim().slice(0, 500);
    const parts = Array.isArray(body.audioParts) ? body.audioParts : null;
    if (!uname || !classroomId) {
      return res.status(400).json({ ok: false, message: '需要 username 与 classroomId' });
    }
    if (!parts || parts.length < 1) {
      return res.status(400).json({ ok: false, message: '请至少上传一个录音文件' });
    }
    if (parts.length > 12) {
      return res.status(400).json({ ok: false, message: '单次最多 12 个文件' });
    }
    if (!(await userHasRole(uname, 'student'))) {
      return res.status(403).json({ ok: false, message: '仅学生可打卡' });
    }
    const { data: m, error: mErr } = await supabase
      .from('classroom_members')
      .select('classroom_id')
      .eq('classroom_id', classroomId)
      .eq('student_username', uname)
      .maybeSingle();
    if (mErr || !m) {
      return res.status(403).json({ ok: false, message: '请先加入该班级再打卡' });
    }
    if (CLASSROOM_CHECKIN_DAILY_LIMIT > 0) {
      const { count, error: cErr } = await supabase
        .from('classroom_checkins')
        .select('*', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('student_username', uname)
        .gte('submitted_at', startOfUtcDayIso());
      if (cErr) {
        console.error(cErr);
        return res.status(500).json({ ok: false, message: '次数校验失败' });
      }
      if ((count || 0) >= CLASSROOM_CHECKIN_DAILY_LIMIT) {
        return res.status(429).json({
          ok: false,
          message: `本班今日打卡已达上限（${CLASSROOM_CHECKIN_DAILY_LIMIT} 次/人，UTC 日）。可联系教师或明日再试。可在服务端设置 CLASSROOM_CHECKIN_DAILY_LIMIT。`,
        });
      }
    }
    const buffers = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i] || {};
      const b64 = typeof p.b64 === 'string' ? p.b64 : typeof p.audioB64 === 'string' ? p.audioB64 : '';
      if (!b64) {
        return res.status(400).json({ ok: false, message: `第 ${i + 1} 个文件缺少数据` });
      }
      let buf;
      try {
        buf = Buffer.from(b64, 'base64');
      } catch (e) {
        return res.status(400).json({ ok: false, message: `第 ${i + 1} 个文件数据无效` });
      }
      if (!buf || buf.length < 100) {
        return res.status(400).json({ ok: false, message: `第 ${i + 1} 个文件过小或无效` });
      }
      const ct = typeof p.contentType === 'string' ? p.contentType : 'audio/webm';
      buffers.push({ buf, contentType: ct });
    }
    const results = await Promise.all(
      buffers.map((b) => runUploadAudioCorrectToPython(b.buf, b.contentType))
    );
    const firstErr = results.find((r) => r.err);
    if (firstErr) {
      return res.status(500).json({ ok: false, message: firstErr.err });
    }
    const files = results.map((r) => r.data);
    const evalData = { ok: true, multi: true, files };
    const { data: ins, error: insErr } = await supabase
      .from('classroom_checkins')
      .insert({
        classroom_id: classroomId,
        student_username: uname,
        note: note || null,
        eval_data: evalData,
      })
      .select('id, submitted_at')
      .single();
    if (insErr || !ins) {
      console.error(insErr);
      return res.status(500).json({ ok: false, message: '保存打卡失败' });
    }
    res.json({ ok: true, id: ins.id, submittedAt: ins.submitted_at, evalData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '打卡失败' });
  }
});

/** 学生 · 本班已提交打卡（日历用，仅本人） */
app.get('/api/student/classroom-checkins', async (req, res) => {
  try {
    const uname = (req.query.username || req.query.studentName || '').trim();
    const classroomId = (req.query.classroomId || '').trim();
    if (!uname || !classroomId) {
      return res.status(400).json({ ok: false, message: '需要 username 与 classroomId' });
    }
    if (!(await userHasRole(uname, 'student'))) {
      return res.status(403).json({ ok: false, message: '仅学生可查看' });
    }
    const { data: m, error: mErr } = await supabase
      .from('classroom_members')
      .select('classroom_id')
      .eq('classroom_id', classroomId)
      .eq('student_username', uname)
      .maybeSingle();
    if (mErr || !m) {
      return res.status(403).json({ ok: false, message: '未加入该班级' });
    }
    const { data: rows, error } = await supabase
      .from('classroom_checkins')
      .select('id, note, eval_data, submitted_at')
      .eq('classroom_id', classroomId)
      .eq('student_username', uname)
      .order('submitted_at', { ascending: true })
      .limit(500);
    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '查询失败' });
    }
      res.json({ ok: true, list: rows || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
});

/** 连续打卡天数（与 standalone 合并日历日逻辑对齐：趣味印章日 ∪ 班级录音日） */
function pad2(n) {
  return String(n).padStart(2, '0');
}
function dateYmdFromDateJs(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function dateYmdLocalFromIso(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateYmdFromDateJs(d);
}
function streakDaysFromYmdSetDict(setObj) {
  const set = setObj || {};
  let streak = 0;
  let d = new Date();
  const keyFromDate = (dt) => dateYmdFromDateJs(dt);
  if (!set[keyFromDate(d)]) {
    d.setDate(d.getDate() - 1);
  }
  for (let i = 0; i < 400; i++) {
    const key = keyFromDate(d);
    if (set[key]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}
async function mergedCheckinYmdDictForStudent(username) {
  const merged = {};
  const { data: fpRow } = await supabase
    .from('student_fun_practice')
    .select('stamp_dates')
    .eq('username', username)
    .maybeSingle();
  const stamps =
    fpRow && fpRow.stamp_dates != null && Array.isArray(fpRow.stamp_dates) ? fpRow.stamp_dates : [];
  stamps.forEach((s) => {
    const k = String(s || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) merged[k] = true;
  });
  const { data: members } = await supabase
    .from('classroom_members')
    .select('classroom_id')
    .eq('student_username', username);
  for (const m of members || []) {
    const cid = m.classroom_id;
    const { data: rows } = await supabase
      .from('classroom_checkins')
      .select('submitted_at')
      .eq('classroom_id', cid)
      .eq('student_username', username);
    for (const row of rows || []) {
      const y = dateYmdLocalFromIso(row.submitted_at);
      if (y) merged[y] = true;
    }
  }
  return merged;
}

/** 学生 · 趣味 Example 每日进度（练习页打卡日历） */
app.get('/api/student/fun-practice-progress', async (req, res) => {
  try {
    const uname = (req.query.username || '').trim();
    if (!uname) return res.status(400).json({ ok: false, message: '需要 username' });
    if (!(await userHasRole(uname, 'student'))) {
      return res.status(403).json({ ok: false, message: '仅学生可查' });
    }
    const { data: row, error } = await supabase
      .from('student_fun_practice')
      .select('next_day, stamp_dates, badges')
      .eq('username', uname)
      .maybeSingle();
    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: '读取失败' });
    }
    const nextDay = row && typeof row.next_day === 'number' ? row.next_day : 1;
    const stampDates =
      row && row.stamp_dates != null && Array.isArray(row.stamp_dates) ? row.stamp_dates : [];
    const badges = row && row.badges != null && Array.isArray(row.badges) ? row.badges : [];
    res.json({ ok: true, nextDay, stampDates, badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

/** 学生 · 领取「持续练习勋章」（连续打卡满 10 天：趣味 Example + 班级录音合并）；幂等 */
app.post('/api/student/claim-streak-badge', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const uname = String(username || '').trim();
    const pwd = String(password || '');
    if (!uname || !pwd) return res.status(400).json({ ok: false, message: '需要账号与密码' });
    const { data: user, error: ue } = await supabase
      .from('users')
      .select('username, password, role')
      .eq('username', uname)
      .maybeSingle();
    if (ue || !user || user.password !== pwd) {
      return res.status(401).json({ ok: false, message: '账号或密码错误' });
    }
    if ((user.role || 'student') !== 'student') {
      return res.status(403).json({ ok: false, message: '仅学生可领取' });
    }
    const { data: row, error: fe } = await supabase
      .from('student_fun_practice')
      .select('next_day, stamp_dates, badges')
      .eq('username', uname)
      .maybeSingle();
    if (fe) {
      console.error(fe);
      return res.status(500).json({ ok: false, message: '读取进度失败' });
    }
    let badges = row && row.badges != null && Array.isArray(row.badges) ? [...row.badges] : [];
    const hasStreak = badges.some((b) => b && b.id === 'streak_10');
    if (hasStreak) {
      return res.json({ ok: true, badges, newlyAwarded: false });
    }
    const merged = await mergedCheckinYmdDictForStudent(uname);
    const streak = streakDaysFromYmdSetDict(merged);
    if (streak < 10) {
      return res.json({
        ok: true,
        badges,
        newlyAwarded: false,
        streakDays: streak,
        message: '当前连续打卡未满 10 天（趣味 Example + 班级录音合并统计）',
      });
    }
    const entry = {
      id: 'streak_10',
      label: '持续练习勋章',
      streakDays: streak,
      awardedAt: new Date().toISOString(),
    };
    badges = badges.concat(entry);
    const nextDay = row && typeof row.next_day === 'number' ? row.next_day : 1;
    const stampDates =
      row && row.stamp_dates != null && Array.isArray(row.stamp_dates) ? row.stamp_dates : [];
    const payload = {
      username: uname,
      next_day: nextDay,
      stamp_dates: stampDates,
      badges,
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase.from('student_fun_practice').upsert(payload, {
      onConflict: 'username',
    });
    if (upErr) {
      console.error(upErr);
      return res.status(500).json({ ok: false, message: '保存勋章失败（若尚未执行 SQL，请运行 server/supabase-streak-badge.sql）' });
    }
    return res.json({ ok: true, badges, newlyAwarded: true, streakDays: streak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

/** 完成当日 Example 关卡（校验顺序；盖章日期由前端传本地 YYYY-MM-DD） */
app.post('/api/student/fun-practice-complete-day', async (req, res) => {
  try {
    const { username, password, completedDay, completedDateYmd } = req.body || {};
    const uname = String(username || '').trim();
    const pwd = String(password || '');
    const day = parseInt(completedDay, 10);
    const ymd = String(completedDateYmd || '').trim().slice(0, 10);
    if (!uname || !pwd || !Number.isFinite(day) || day < 1) {
      return res.status(400).json({ ok: false, message: '需要账号、密码与 completedDay' });
    }
    const { data: user, error: ue } = await supabase
      .from('users')
      .select('username, password, role')
      .eq('username', uname)
      .maybeSingle();
    if (ue || !user || user.password !== pwd) {
      return res.status(401).json({ ok: false, message: '账号或密码错误' });
    }
    if ((user.role || 'student') !== 'student') {
      return res.status(403).json({ ok: false, message: '仅学生可同步进度' });
    }
    const { data: existing, error: fe } = await supabase
      .from('student_fun_practice')
      .select('next_day, stamp_dates, badges')
      .eq('username', uname)
      .maybeSingle();
    if (fe) {
      console.error(fe);
      return res.status(500).json({ ok: false, message: '读取进度失败' });
    }
    const expected = existing && typeof existing.next_day === 'number' ? existing.next_day : 1;
    if (day !== expected) {
      return res.status(409).json({
        ok: false,
        message: `当前应完成第 ${expected} 天，无法提交第 ${day} 天`,
      });
    }
    const stamps =
      existing && existing.stamp_dates != null && Array.isArray(existing.stamp_dates)
        ? [...existing.stamp_dates]
        : [];
    if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !stamps.includes(ymd)) {
      stamps.push(ymd);
    }
    const nextDayOut = day + 1;
    const existingBadges =
      existing && existing.badges != null && Array.isArray(existing.badges) ? [...existing.badges] : [];
    const payload = {
      username: uname,
      next_day: nextDayOut,
      stamp_dates: stamps,
      badges: existingBadges,
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase.from('student_fun_practice').upsert(payload, {
      onConflict: 'username',
    });
    if (upErr) {
      console.error(upErr);
      return res.status(500).json({ ok: false, message: '保存失败' });
    }
    res.json({ ok: true, nextDay: nextDayOut, stampDates: stamps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

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

/** 教师为学生开通 / 关闭 Interview 云端 ASR+批改（作业 submit-audio 与题库自评 interview-self-eval） */
app.post('/api/teacher/student-interview-grading', async (req, res) => {
  try {
    const { teacherUsername, studentUsername, approved } = req.body || {};
    const t = (teacherUsername || '').trim();
    const s = (studentUsername || '').trim();
    if (!t || !s) return res.status(400).json({ ok: false, message: '需要 teacherUsername 与 studentUsername' });
    const { data: tu, error: te } = await supabase.from('users').select('id, role').eq('username', t).maybeSingle();
    if (te || !tu || (tu.role || 'student') !== 'teacher') {
      return res.status(403).json({ ok: false, message: '仅教师可操作' });
    }
    const { data: su, error: se } = await supabase.from('users').select('id, role').eq('username', s).maybeSingle();
    if (se || !su) return res.status(404).json({ ok: false, message: '未找到该学生用户名' });
    if ((su.role || 'student') !== 'student') {
      return res.status(400).json({ ok: false, message: '目标账号不是学生' });
    }
    const want = approved !== false;
    const { error: upErr } = await supabase.from('users').update({ interview_grading_approved: want }).eq('username', s);
    if (upErr) {
      return res.status(500).json({
        ok: false,
        message: formatSupabaseError(upErr) || '更新失败（请确认已执行 supabase-portal-student-v1.sql）',
      });
    }
    res.json({ ok: true, username: s, interviewGradingApproved: want });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器错误' });
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

/** 学生 Interview 自主练习：经 Node 转发 Python upload-audio-correct（与主站「上传录音」同路，勿用 asr-eval） */
app.post('/api/student/interview-self-eval', async (req, res) => {
  try {
    const u = String(req.query.username || '').trim();
    const { audioB64, refText } = req.body || {};
    if (!u) return res.status(400).json({ ok: false, message: '需要 username' });
    const b64 = typeof audioB64 === 'string' ? audioB64 : '';
    if (!b64) return res.status(400).json({ ok: false, message: '缺少 audioB64' });

    const approval = await getStudentInterviewApproval(u);
    if (!approval.ok || !approval.approved) {
      return res.status(403).json({
        ok: false,
        message:
          '未开通 Interview 云端批改。请向教师申请开通，或使用页面「实时语音转写」复制到外部 AI；Listen & Repeat 不受此限制。',
      });
    }

    const audioBytes = Buffer.from(b64, 'base64');
    const form = new FormData();
    const audioBlob = new Blob([audioBytes], { type: 'audio/webm' });
    form.append('audio', audioBlob, 'real-test.webm');
    form.append('refText', String(refText || ''));
    form.append('evalMode', '3');

    const pyResp = await fetch(PYTHON_BASE_URL + '/api/upload-audio-correct', {
      method: 'POST',
      body: form,
    });
    const pyData = await pyResp.json().catch(() => ({}));
    if (!pyResp.ok || !pyData || pyData.ok !== true) {
      const msg = pyData && pyData.error ? pyData.error : 'Python 评测失败';
      return res.status(500).json({ ok: false, message: msg });
    }
    res.json(pyData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '评测失败' });
  }
});

// ---------- 学生：只提交音频（Interview 作业云端批改） ----------
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

    const { data: asgRow, error: asgErr } = await supabase
      .from('assignments')
      .select('items')
      .eq('id', aid)
      .maybeSingle();
    if (asgErr || !asgRow) {
      return res.status(404).json({ ok: false, message: '任务不存在' });
    }
    const itemMode = getAssignmentItemModeFromItems(asgRow.items, qid);
    const isListenRepeat = itemMode === 'listenRepeat';

    if (!isListenRepeat) {
      const approval = await getStudentInterviewApproval(uname);
      if (!approval.ok || !approval.approved) {
        return res.status(403).json({
          ok: false,
          message:
            '未开通 Interview 云端批改。请向教师申请开通，或使用浏览器内「实时语音转写」复制后在外部 AI 批改；Listen & Repeat 不受此限制。',
        });
      }
    }

    // 1) 立即评测并保存结果：音频不落库（只把 Python 的转写/批改结果写入 eval_data）
    // LNR：与 Listen&Repeat 子页一致 → oral-eval（智聆 + 句级）。Interview：与主站「上传」一致 → upload-audio-correct（长音频 ASR + TokenHub）。
    const audioBytes = isRawAudio ? req.body : Buffer.from(b64, 'base64');

    const form = new FormData();
    const audioBlob = new Blob([audioBytes], { type: 'audio/webm' });
    form.append('audio', audioBlob, 'student-task.webm');
    form.append('refText', rtxt || '');
    form.append('evalMode', isListenRepeat ? '1' : '3');

    const pyUrl = isListenRepeat
      ? `${PYTHON_BASE_URL}/api/oral-eval`
      : `${PYTHON_BASE_URL}/api/upload-audio-correct`;
    const pyResp = await fetch(pyUrl, {
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
      .select('id, items')
      .eq('id', aid)
      .maybeSingle();
    if (aErr || !assignmentRow) {
      return res.status(404).json({ ok: false, message: '任务不存在' });
    }
    const evItemMode = getAssignmentItemModeFromItems(assignmentRow.items, qid);
    const evIsListenRepeat = evItemMode === 'listenRepeat';

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
    form.append('evalMode', evIsListenRepeat ? '1' : '3');

    const evPyUrl = evIsListenRepeat
      ? `${PYTHON_BASE_URL}/api/oral-eval`
      : `${PYTHON_BASE_URL}/api/upload-audio-correct`;
    const pyResp = await fetch(evPyUrl, {
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
    'API: auth, practice, tencent-asr/sign, teacher/assignments & classrooms, student/assignments & classrooms & classroom-checkin / classroom-checkin-batch & classroom-checkins, submit-audio, …' +
      (String(process.env.POC_MODE || '').trim() === '1' ? ' poc/*' : '')
  );
  if (TENCENT_ASR_APP_ID && TENCENT_ASR_SECRET_ID && TENCENT_ASR_SECRET_KEY) {
    console.log('腾讯云实时 ASR 签名：已配置 TENCENT_ASR_APP_ID / SECRET_*');
  } else {
    console.log('腾讯云实时 ASR 签名：未配置（Interview 流式转写需配置 TENCENT_ASR_*，见 server/.env.example）');
  }
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
