"""
Real Test 口语评测后端（Python）
对接前端 standalone.html 的 POST /api/oral-eval，调用腾讯云智聆口语评测（新版）WebSocket。
文档：https://cloud.tencent.com/document/product/1774/107497
"""
import os
import re
import shutil
import subprocess

# 若 ffmpeg/ffprobe 放在本项目同目录下，加入 PATH，方便 pydub 找到
_APP_DIR = os.path.dirname(os.path.abspath(__file__))
# 必须先加载 .env，再读取下面的 TENCENT_* / ASR_*，否则 oral-eval 里 ASR 永远读不到密钥
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(_APP_DIR, ".env"))
except ImportError:
    pass
_FFMPEG = os.path.join(_APP_DIR, "ffmpeg")
_FFPROBE = os.path.join(_APP_DIR, "ffprobe")
if os.path.isfile(_FFMPEG) and os.path.isfile(_FFPROBE):
    os.environ["PATH"] = _APP_DIR + os.pathsep + os.environ.get("PATH", "")
import time
import uuid
import hmac
import hashlib
import base64
import requests
import urllib.parse
import json
import unicodedata
from typing import Any, Optional

from flask import Flask, request, jsonify

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB


@app.after_request
def cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

TENCENT_APP_ID = os.environ.get("TENCENT_APP_ID", "")
TENCENT_SECRET_ID = os.environ.get("TENCENT_SECRET_ID", "")
TENCENT_SECRET_KEY = os.environ.get("TENCENT_SECRET_KEY", "")
SOE_HOST = "soe.cloud.tencent.com"
SOE_PATH_PREFIX = "/soe/api/"
LT_API_URL = os.environ.get("LT_API_URL", "http://localhost:8010/v2/check")
TENCENT_ASR_REGION = os.environ.get("TENCENT_ASR_REGION", "ap-guangzhou")
# 录音文件识别 CreateRecTask（长音频/上传文件），与 homework-miniapp-server 一致；非「一句话识别」
ASR_ENGINE_MODEL = os.environ.get("ASR_ENGINE_MODEL", "16k_en")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")
OLLAMA_ENABLED = str(os.environ.get("OLLAMA_ENABLED", "1")).strip().lower() in ["1", "true", "yes", "on"]
# 腾讯云 TokenHub（DeepSeek 等），与 homework-miniapp 批改同源
LKE_API_KEY = os.environ.get("LKE_API_KEY", "")
LKE_BASE_URL = os.environ.get("LKE_BASE_URL", "https://tokenhub.tencentmaas.com/v1").rstrip("/")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v3.1-terminus")
DEEPSEEK_MODELS_ENV = (os.environ.get("DEEPSEEK_MODELS") or "").strip()
_DEEPSEEK_FALLBACKS = (
    "deepseek-v3.2",
    "deepseek-v3.1-terminus",
)


@app.route("/api/health", methods=["GET"])
def api_health():
    """
    自检：进程是否读到 ASR 相关环境变量、腾讯云 SDK 是否已安装（不返回任何密钥内容）。
    浏览器打开：http://localhost:5001/api/health
    """
    sdk_ok = False
    try:
        import tencentcloud  # noqa: F401

        sdk_ok = True
    except ImportError:
        pass
    pydub_ok = False
    try:
        import pydub  # noqa: F401

        pydub_ok = True
    except ImportError:
        pass
    openai_ok = False
    try:
        import openai  # noqa: F401

        openai_ok = True
    except ImportError:
        pass
    return jsonify(
        ok=True,
        service="oral-python-backend",
        tencentcloud_sdk_installed=sdk_ok,
        lke_key_configured=bool(LKE_API_KEY and LKE_API_KEY.strip()),
        lke_base_url=LKE_BASE_URL,
        openai_installed=openai_ok,
        tencent_credential_for_file_asr=bool(
            TENCENT_SECRET_ID and TENCENT_SECRET_KEY
        ),
        asr_engine_model=ASR_ENGINE_MODEL,
        soe_configured=bool(
            TENCENT_APP_ID and TENCENT_SECRET_ID and TENCENT_SECRET_KEY
        ),
        ffmpeg_path=shutil.which("ffmpeg") or "",
        ffprobe_path=shutil.which("ffprobe") or "",
        pydub_import_ok=pydub_ok,
        hint="LNR 需 soe_configured（TENCENT_APP_ID + SECRET_*）；转写/批改需 tencent_credential_for_file_asr（同一对 SECRET_*）。Interview 流式 ASR 在 server/.env 的 TENCENT_ASR_*。",
    )


def _which_ffmpeg():
    return shutil.which("ffmpeg")


def _which_ffprobe():
    return shutil.which("ffprobe")


def _ffmpeg_stdin_to_wav_16k_mono_try_formats(
    audio_bytes: bytes, filename_hint: str = ""
):
    """
    依次尝试 ffmpeg 自动检测 + 按扩展名指定 demuxer，输出 16kHz 单声道 pcm_s16le WAV。
    用于 m4a/mp3 等：避免未转码直传腾讯云时云端解码失败（ErrorInvalidVoicedata）。
    """
    ff = _which_ffmpeg()
    if not ff:
        return None, "未找到 ffmpeg"
    fn = (filename_hint or "").lower()
    attempts: list[tuple[list[str], bytes]] = []
    seen: set[tuple[str, ...]] = set()

    def _add(cmd_prefix: list[str], data: bytes) -> None:
        key = tuple(cmd_prefix)
        if key in seen:
            return
        seen.add(key)
        attempts.append((cmd_prefix, data))

    _add(["-i", "pipe:0"], audio_bytes)
    if fn.endswith(".mp3") or "mpeg" in fn or "mp3" in fn:
        _add(["-f", "mp3", "-i", "pipe:0"], audio_bytes)
    if fn.endswith((".m4a", ".mp4", ".mov", ".caf", ".3gp", ".3gpp")):
        _add(["-f", "mov", "-i", "pipe:0"], audio_bytes)
    if fn.endswith(".aac"):
        _add(["-f", "aac", "-i", "pipe:0"], audio_bytes)
    if fn.endswith(".flac"):
        _add(["-f", "flac", "-i", "pipe:0"], audio_bytes)
    if fn.endswith((".ogg", ".opus")):
        _add(["-f", "ogg", "-i", "pipe:0"], audio_bytes)
    if fn.endswith(".wav"):
        _add(["-f", "wav", "-i", "pipe:0"], audio_bytes)
    if fn.endswith((".webm", ".weba")) or "webm" in fn:
        _add(["-f", "webm", "-i", "pipe:0"], audio_bytes)
        _add(["-f", "matroska", "-i", "pipe:0"], audio_bytes)
    else:
        # 无扩展名或非常见名：仍试浏览器常见容器
        _add(["-f", "webm", "-i", "pipe:0"], audio_bytes)
        _add(["-f", "matroska", "-i", "pipe:0"], audio_bytes)
    last_err = None
    for extra_pre, data in attempts:
        try:
            args = [ff, "-hide_banner", "-loglevel", "error"] + extra_pre
            args += [
                "-f",
                "wav",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                "pipe:1",
            ]
            proc = subprocess.run(args, input=data, capture_output=True, timeout=120)
            stderr = (proc.stderr or b"").decode("utf-8", errors="replace")
            if (
                proc.returncode == 0
                and (proc.stdout or b"")
                and len(proc.stdout) > 100
                and (proc.stdout[:4] == b"RIFF")
            ):
                return proc.stdout, None
            last_err = stderr[:900] or f"exit {proc.returncode}"
        except Exception as e:
            last_err = str(e)
            continue
    return None, last_err or "ffmpeg 无法解码该音频"


def _browser_audio_bytes_to_wav_16k_mono(audio_bytes: bytes):
    """
    浏览器上传的 webm/weba 等 → 16k 单声道 wav bytes。
    返回 (wav_bytes|None, error_str|None)。
    """
    if not _which_ffmpeg() or not _which_ffprobe():
        return None, (
            "服务器未找到 ffmpeg 或 ffprobe，无法将浏览器 WebM 转为 WAV。"
            " 本机请执行：brew install ffmpeg（Windows：choco install ffmpeg）。"
            " 云部署请使用仓库 oral-python-backend/Dockerfile（已 apt 安装 ffmpeg），"
            " 勿仅用 pip install 而不装系统级 ffmpeg。"
        )
    try:
        import io

        from pydub import AudioSegment
    except ImportError:
        AudioSegment = None  # type: ignore

    last_pydub = None
    if AudioSegment is not None:
        buf = io.BytesIO(audio_bytes)
        for fmt in ("webm", "matroska", "ogg", None):
            try:
                buf.seek(0)
                seg = AudioSegment.from_file(buf, format=fmt)
                seg = seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
                out = io.BytesIO()
                seg.export(out, format="wav")
                w = out.getvalue()
                if len(w) > 100:
                    return w, None
            except Exception as e:
                last_pydub = e
                continue

    w2, err2 = _ffmpeg_stdin_to_wav_16k_mono_try_formats(audio_bytes)
    if w2:
        return w2, None

    parts = []
    if last_pydub:
        parts.append("pydub：" + str(last_pydub)[:400])
    if err2:
        parts.append("ffmpeg：" + str(err2)[:500])
    return None, " | ".join(parts) if parts else "音频转码失败"


def _normalize_audio_bytes_for_tencent_rec_file(
    audio_bytes: bytes, filename: str
) -> tuple[Optional[bytes], Optional[str]]:
    """
    CreateRecTask 前统一为 16k 单声道 PCM WAV。
    部分 m4a/mp3 若不经转码直传，腾讯云会报 ErrorInvalidVoicedata（Audio decoding failed）。
    """
    wav, err = _ffmpeg_stdin_to_wav_16k_mono_try_formats(
        audio_bytes, (filename or "").lower()
    )
    if wav and len(wav) > 100 and wav[:4] == b"RIFF":
        return wav, None
    w2, err2 = _browser_audio_bytes_to_wav_16k_mono(audio_bytes)
    if w2 and len(w2) > 100 and w2[:4] == b"RIFF":
        return w2, None
    parts: list[str] = []
    if err:
        parts.append("ffmpeg: " + (err or "")[:500])
    if err2:
        parts.append("备用转码: " + (err2 or "")[:500])
    return None, " | ".join(parts) if parts else "音频转码失败"


def _extract_first_json_list(s: str):
    """从包含多余文本的 LLM 输出中，尽量提取第一个 JSON array。"""
    if not s:
        return []
    start = s.find("[")
    end = s.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        return json.loads(s[start : end + 1])
    except Exception:
        return []


def _call_ollama_grammar_items(transcript: str):
    if not OLLAMA_ENABLED:
        return []
    prompt = f"""
You are an English teacher for spoken English feedback.
Only focus on grammar and word choice suitability (e.g., subject-verb agreement, noun singular/plural, article usage, verb tense, comparative forms, collocations).

Important:
- Do NOT suggest changes related to spelling mistakes.
- Do NOT suggest changes related to punctuation or spacing (e.g., "add a space between sentences").
- Do NOT give style suggestions or rewriting for better wording unless it fixes a clear grammar/word-choice error.
- Provide concise fixes for real errors.

Return ONLY valid JSON array (no markdown, no extra text). The array items must be objects with EXACT keys:
  original: the original phrase/span from the transcript that contains the error
  suggestion: the corrected phrase/span
  reason_zh: a short Chinese explanation of why it's wrong (e.g., 主谓一致、名词单复数、冠词用法、比较级形式、固定搭配等)

If the transcript has clear grammar/word-choice errors, you MUST return at least 2 items (up to 12). Do NOT return an empty array unless the transcript is already fully acceptable.

Transcript:
\"\"\"{transcript}\"\"\"
"""
    resp = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 260},
        },
        timeout=180,
    )
    resp.raise_for_status()
    body = resp.json()
    raw = body.get("response", "") if isinstance(body, dict) else ""
    items = _extract_first_json_list(raw)
    if not isinstance(items, list):
        return []
    cleaned = []
    for it in items:
        if not isinstance(it, dict):
            continue
        if "original" in it and "suggestion" in it and "reason_zh" in it:
            cleaned.append(
                {
                    "original": str(it.get("original", "")),
                    "suggestion": str(it.get("suggestion", "")),
                    "reason_zh": str(it.get("reason_zh", "")),
                }
            )
    return cleaned


def _extract_first_json_object(s: str):
    """从包含多余文本的 LLM 输出中，尽量提取第一个 JSON object。"""
    if not s:
        return {}

    # 去掉 ```json ... ``` 这种包裹
    s = re.sub(r"```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = s.replace("```", "")

    start = s.find("{")
    if start == -1:
        return {}

    # brace 配对提取（避免简单 rfind("}") 在字符串包含 } 时出错）
    depth = 0
    in_str = False
    escape = False
    end = None
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break

    if end is None or end <= start:
        return {}

    candidate = s[start : end + 1].strip()
    try:
        return json.loads(candidate)
    except Exception:
        return {}


def _logic_issue_zh_meaningful(s: str) -> bool:
    """逻辑问题一条：冒号后须有实质中文说明，避免模型只输出标签。"""
    t = (s or "").strip()
    if len(t) < 10:
        return False
    for sep in ("：", ":"):
        if sep in t:
            rest = t.split(sep, 1)[1].strip()
            return len(rest) >= 10
    return len(t) >= 18


def _call_ollama_grammar_pack(transcript: str):
    """
    返回：
      items: 语法/词法错误列表（排除拼写/标点/空格）
      corrected_transcript: 修改后的范文（整段连贯）
      segments: 自然“思维块”分句（不依赖 ASR 标点）
      logic_chain: 学生展开的逻辑链条（按原顺序拆成若干步）
      connection_corrections: 句子衔接/连接词修正建议
    """
    if not OLLAMA_ENABLED:
        return [], transcript, [], [], [], []
    prompt = f"""
You are an English teacher for spoken English feedback.
The transcript below is ASR output and may contain:
  - wrong word boundaries (words split/merged)
  - duplicated fillers (um, I think, you know)
  - messy punctuation (commas/periods are unreliable)

GOAL:
Produce teaching-grade corrections for grammar/word-choice/meaning-logic.
Students should be able to read the corrected version naturally.

Hard constraints:
- Do NOT focus on spelling, punctuation, or spacing.
- Do NOT suggest "add a space" / punctuation spacing fixes.
- Do NOT propose stylistic rewrites; only fix errors that change grammar correctness or meaning clarity.

What to catch (examples of error TYPES only — do not inject these topics into logicChain):
- subject-verb agreement, articles, word form, collocation, wrong word choice, unclear contradictory meaning

Return ONLY valid JSON (no markdown, no extra text) with EXACT keys:
{{
  "correctedTranscript": "...",
  "segments": ["...", "...", "...", "..."],
  "logicChain": ["...", "...", "..."],
  "logicIssuesZh": ["...", "..."],
  "connectionCorrections": [
    {{
      "original": "...",
      "issue_zh": "...",
      "connectorSuggestion": "...",
      "suggestedRephrase": "..."
    }}
  ],
  "items": [
    {{
      "original": "...",
      "suggestion": "...",
      "reason_zh": "..."
    }}
  ]
}}

Rules:
1) correctedTranscript:
   - a single coherent corrected version of the whole transcript
   - keep the student's meaning, just make it clear and grammatical
   - MUST be a non-empty string (if no changes needed, return the input transcript trimmed)
2) segments:
   - 4-6 segments (3 is allowed only if transcript is extremely short)
   - each segment must be a natural "thought chunk" based on meaning transitions
   - IMPORTANT: do NOT use the input punctuation to split
   - each segment must NOT contain commas or periods (.,;:!?). If you need separation, use plain text fragments without punctuation.
   - If you cannot split well, still return 4 segments by re-chunking transcript content (no punctuation)
   - MUST be a non-empty list
3) items:
   - max 12 items
   - each item must target a real issue that affects grammar or meaning clarity
   - original MUST be an exact substring that appears in the input transcript
   - original and suggestion must be minimal-span corrections (不要整句；只保留“需要改的那一小段”)
   - original and suggestion length each <= 80 characters (after trimming)
   - reason_zh must be Chinese ONLY and MUST start with the issue type (e.g., 主谓一致/名词单复数/冠词/比较级/词义不清/逻辑不清), then a full-width colon `：`, then a short Chinese explanation; DO NOT include English

4) logicChain (argument flow, NOT transcript slices):
   - MUST be a non-empty list with 3-8 steps (fewer if the transcript is very short)
   - Each step = ONE short abstract label for an idea that ALREADY appears in THIS transcript (paraphrase allowed, but the TOPIC must match the student's answer — shopping, study, work, health, etc.)
   - Do NOT copy consecutive words from the transcript; compress into concept labels
   - Order = how ideas build (claim -> reason -> example -> implication), not word order
   - each step <= 90 characters
   - CRITICAL: Do NOT output topics that are not in the transcript. Ignore ANY example jobs/salary/PM/programmer/coding in this prompt — those are forbidden placeholders.

5) logicIssuesZh (logic / redundancy in the answer):
   - MUST be a list with 0-4 items (use [] if the answer is coherent and non-repetitive)
   - Each item is Chinese ONLY: tag (观点重复/循环论证/展开不足/因果不清/跳跃) + full-width colon ： + **至少 12 个汉字**的具体说明，必须引用学生原文中的词句或意思（不得只写标签、不得空着冒号后内容）
   - If you cannot give a concrete explanation, OMIT that item entirely (use fewer items or [])
   - Diagnose ONLY problems visible in THIS transcript. Do NOT invent problems about unrelated themes.

6) connectionCorrections:
   - focus on sentence-to-sentence transitions and connector usage (e.g., because/so/but/however/therefore/instead/also)
   - identify where the connection is unclear, contradictory, or the connector is misused
   - MUST return a list (items can be empty [])
   - return 0-8 items
   - original MUST be a short substring from input transcript (<= 80 chars)
   - issue_zh MUST be Chinese ONLY and MUST start with the issue type (e.g., 因果连接不清/转折连接不当/并列连接不当/连接词搭配不当), then a full-width colon `：`, then a short Chinese explanation; DO NOT include English
   - connectorSuggestion MUST be the corrected connector phrase (<= 50 chars), in English
   - suggestedRephrase MUST be a minimal rephrasing snippet in English (<= 120 chars) showing how to connect; do NOT rewrite the entire transcript

Input transcript:
\"\"\"{transcript}\"\"\"
"""
    resp = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            # 让输出更稳定，减少“JSON 不闭合/多余文本”的概率
            "options": {"temperature": 0.0, "num_predict": 520},
        },
        timeout=240,
    )
    resp.raise_for_status()
    body = resp.json()
    raw = body.get("response", "") if isinstance(body, dict) else ""
    obj = _extract_first_json_object(raw)

    corrected = obj.get("correctedTranscript", "") if isinstance(obj, dict) else ""
    segments = obj.get("segments", []) if isinstance(obj, dict) else []
    items = obj.get("items", []) if isinstance(obj, dict) else []
    logic_chain = obj.get("logicChain", []) if isinstance(obj, dict) else []
    logic_issues_raw = obj.get("logicIssuesZh", []) if isinstance(obj, dict) else []
    connection_items = obj.get("connectionCorrections", []) if isinstance(obj, dict) else []

    if not isinstance(segments, list):
        segments = []
    cleaned_items = []
    if isinstance(items, list):
        for it in items:
            if not isinstance(it, dict):
                continue
            if "original" in it and "suggestion" in it and "reason_zh" in it:
                cleaned_items.append(
                    {
                        "original": str(it.get("original", "")),
                        "suggestion": str(it.get("suggestion", "")),
                        "reason_zh": str(it.get("reason_zh", "")),
                    }
                )
    cleaned_logic_chain = []
    if isinstance(logic_chain, list):
        for s in logic_chain:
            if s is None:
                continue
            if isinstance(s, dict):
                s = (
                    s.get("step")
                    or s.get("text")
                    or s.get("summary")
                    or s.get("content")
                    or ""
                )
            t = str(s).strip()
            if t:
                cleaned_logic_chain.append(t[:200])

    logic_issues_zh = []
    if isinstance(logic_issues_raw, list):
        for s in logic_issues_raw:
            if s is None:
                continue
            t = str(s).strip()
            if t and _logic_issue_zh_meaningful(t):
                logic_issues_zh.append(t[:400])

    cleaned_connections = []
    if isinstance(connection_items, list):
        for it in connection_items:
            if not isinstance(it, dict):
                continue
            if "original" in it and "issue_zh" in it and "connectorSuggestion" in it and "suggestedRephrase" in it:
                cleaned_connections.append(
                    {
                        "original": str(it.get("original", "")),
                        "issue_zh": str(it.get("issue_zh", "")),
                        "connectorSuggestion": str(it.get("connectorSuggestion", "")),
                        "suggestedRephrase": str(it.get("suggestedRephrase", "")),
                    }
                )
    # fallback：如果 Ollama JSON 解析失败/字段为空，至少返回 transcript，避免前端“空白”
    # 注意：这里不替代语法纠错；只保证 correctedTranscript 不为空，同时尽量给 segments。
    if (not str(corrected).strip()):
        corrected = transcript
    if (not segments) and transcript:
        cleaned_segments = (
            str(transcript or "")
            .replace(r"[\\.,;:!\\?，。！？、]", " ")
            .replace(r"\\s+", " ")
            .strip()
        )
        if cleaned_segments:
            # 用空格做简单切块，保证 segments 至少有若干条（无标点）
            words = cleaned_segments.split(" ")
            segs = []
            for i in range(0, len(words), 10):
                chunk = " ".join(words[i : i + 10]).strip()
                if chunk:
                    segs.append(chunk)
            segments = segs[:6]

    # 逻辑链不再用 segments 冒充；若主包未给出抽象链或中文诊断，再走一次轻量逻辑分析
    if (not cleaned_logic_chain or not logic_issues_zh) and transcript.strip():
        try:
            lc2, iss2 = _call_ollama_logic_analysis(transcript)
            if not cleaned_logic_chain and lc2:
                cleaned_logic_chain = lc2
            if not logic_issues_zh and iss2:
                logic_issues_zh = iss2
        except Exception:
            pass

    if (
        not cleaned_items
        and transcript
        and len(transcript.strip()) > 40
    ):
        try:
            retry = _call_ollama_grammar_items(transcript)
            if retry:
                cleaned_items = retry[:12]
        except Exception:
            pass

    return (
        cleaned_items,
        corrected,
        segments,
        cleaned_logic_chain,
        cleaned_connections,
        logic_issues_zh,
    )


def _call_ollama_logic_analysis(transcript: str):
    """二次轻量调用：抽象「逻辑链条」+ 中文「逻辑问题」诊断（观点重复/循环/展开不足等）。"""
    if not transcript or len(transcript.strip()) < 8:
        return [], []
    if not OLLAMA_ENABLED:
        return [], []
    prompt = f"""You analyze spoken English argument structure (IELTS-style free response).

Transcript:
\"\"\"{transcript}\"\"\"

Return ONLY valid JSON (no markdown, no extra text) with EXACT keys:
{{
  "logicChain": ["abstract step 1", "step 2", "..."],
  "logicIssuesZh": ["观点重复：...", "展开不足：..."]
}}

logicChain rules:
- 3-8 steps. Each step = ONE compressed idea traceable to THIS transcript only, NOT a direct quote.
- Use English or short Chinese labels. Show the student's actual line of reasoning (e.g. stated preference → personal reason → expected benefit). Steps MUST reflect words/themes from the transcript above.
- Order = logical progression of ideas, not word order in the transcript.
- NEVER invent a different essay topic. If the student talks about shopping/prices, every step must be about that; do NOT output careers, coding, or salaries unless the transcript mentions them.

logicIssuesZh rules:
- 0-4 items in Chinese (use [] if nothing is wrong). Each: tag + ： + **至少 12 个汉字**说明，须点出学生文本中重复或跳跃之处；禁止「观点重复：」后无正文。
- Call out only: repetition, circular reasoning, thin development, weak causal links that you can quote from the transcript.
- For tag == 展开不足 / 展开不够:
  - DO NOT ask the student to add new examples, extra details, or additional evidence.
  - Only suggest how to reorganize the student's existing points: adjust the internal order (claim -> reason -> result/implication), and improve causal/contrast connectors using the SAME ideas already present.
  - 禁止输出含义上类似“再补充/新增例子/更多细节/举更多例子/扩写到具体例子”的要求。
"""
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.0, "num_predict": 360},
            },
            timeout=120,
        )
        resp.raise_for_status()
        body = resp.json()
        raw = body.get("response", "") if isinstance(body, dict) else ""
        obj = _extract_first_json_object(raw)
    except Exception:
        return [], []

    lc = obj.get("logicChain", []) if isinstance(obj, dict) else []
    issues = obj.get("logicIssuesZh", []) if isinstance(obj, dict) else []
    cleaned_lc = []
    if isinstance(lc, list):
        for s in lc:
            if s is None:
                continue
            if isinstance(s, dict):
                s = (
                    s.get("step")
                    or s.get("text")
                    or s.get("summary")
                    or s.get("content")
                    or ""
                )
            t = str(s).strip()
            if t:
                cleaned_lc.append(t[:200])
    cleaned_issues = []
    if isinstance(issues, list):
        for s in issues:
            if s is None:
                continue
            t = str(s).strip()
            if t and _logic_issue_zh_meaningful(t):
                cleaned_issues.append(t[:400])
    return cleaned_lc[:12], cleaned_issues[:6]


def _make_signature(app_id, params, secret_key):
    """除 signature 外参数按字典序排序，拼成签名原文，HMAC-SHA1 + Base64。"""
    sorted_keys = sorted(k for k in params if k != "signature")
    parts = [f"{k}={params[k]}" for k in sorted_keys]
    query = "&".join(parts)
    raw = f"{SOE_HOST}{SOE_PATH_PREFIX}{app_id}?{query}"
    sig = hmac.new(
        secret_key.encode("utf-8"),
        raw.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    return base64.b64encode(sig).decode("utf-8")


def _call_soe_websocket(audio_bytes, ref_text, eval_mode="1", server_engine_type="16k_en", voice_format=0):
    """
    调用智聆口语评测（新版）WebSocket。
    voice_format: 0 pcm, 1 wav, 2 mp3, 4 speex。浏览器多为 webm，若传 webm 会 4007，需先转成 wav/mp3。
    """
    import websocket

    if not TENCENT_APP_ID or not TENCENT_SECRET_ID or not TENCENT_SECRET_KEY:
        return None, "未配置 TENCENT_APP_ID / TENCENT_SECRET_ID / TENCENT_SECRET_KEY"

    voice_id = str(uuid.uuid4())
    timestamp = int(time.time())
    expired = timestamp + 86400
    nonce = int(time.time() * 1000) % 10**10

    params = {
        "secretid": TENCENT_SECRET_ID,
        "timestamp": str(timestamp),
        "expired": str(expired),
        "nonce": str(nonce),
        "voice_id": voice_id,
        "server_engine_type": server_engine_type,
        "ref_text": ref_text,
        "eval_mode": str(eval_mode),
        "score_coeff": "1.0",
        "text_mode": "0",
        "sentence_info_enabled": "0",
        "rec_mode": "1",
        "voice_format": str(voice_format),
    }
    signature = _make_signature(TENCENT_APP_ID, params, TENCENT_SECRET_KEY)
    params["signature"] = signature

    query = "&".join(
        f"{k}={urllib.parse.quote(str(params[k]), safe='')}" for k in sorted(params.keys())
    )
    url = f"wss://{SOE_HOST}{SOE_PATH_PREFIX}{TENCENT_APP_ID}?{query}"

    overall = None
    pron_detail = None
    err_msg = None
    last_result_str = None

    def on_message(ws, message):
        nonlocal overall, pron_detail, err_msg, last_result_str
        try:
            data = json.loads(message)
        except Exception:
            return
        code = data.get("code", 0)
        if code != 0:
            err_msg = data.get("message", f"code={code}")
            try:
                ws.close()
            except Exception:
                pass
            return
        # 官方文档中，最终结果可能只在 final=1 的包里返回，
        # 所以需要在判断 final 之前先处理 result，确保不会丢失 SuggestedScore。
        result = data.get("result")
        if result:
            # result 既可能是 JSON 字符串，也可能是对象，这里统一成字符串原文 + 提取 SuggestedScore
            if isinstance(result, str):
                last_result_str = result
                # 优先尝试按 JSON 解析再取 SuggestedScore
                try:
                    parsed = json.loads(result)
                    score = parsed.get("SuggestedScore")
                    if isinstance(score, (int, float)):
                        overall = float(score)
                except Exception:
                    # 退而求其次用正则匹配，例如 "SuggestedScore\": 89.3
                    m = re.search(r'SuggestedScore\"?\\s*[:=]\\s*([\\-\\d.]+)', result)
                    if m:
                        try:
                            overall = float(m.group(1))
                        except ValueError:
                            pass
            else:
                # dict / list 等，直接从字段读取
                last_result_str = json.dumps(result, ensure_ascii=False)
                try:
                    score = result.get("SuggestedScore") if isinstance(result, dict) else None
                    if isinstance(score, (int, float)):
                        overall = float(score)
                except Exception:
                    pass
        if data.get("final") == 1:
            try:
                ws.close()
            except Exception:
                pass
            return

    def on_error(ws, error):
        nonlocal err_msg
        err_msg = str(error)

    ws = websocket.WebSocketApp(
        url,
        on_message=on_message,
        on_error=on_error,
    )
    # 同步跑：在子线程中 run_forever，主线程发数据并收尾
    import threading
    connected = threading.Event()

    def on_open(wsock):
        connected.set()

    ws.on_open = on_open
    thread = threading.Thread(target=lambda: ws.run_forever())
    thread.daemon = True
    thread.start()
    if not connected.wait(timeout=10):
        return None, err_msg or "WebSocket 连接超时"

    try:
        ws.send(audio_bytes, opcode=websocket.ABNF.OPCODE_BINARY)
        ws.send(json.dumps({"type": "end"}), opcode=websocket.ABNF.OPCODE_TEXT)
        thread.join(timeout=30)
    finally:
        ws.close()

    if err_msg:
        return None, err_msg
    pron_detail = last_result_str
    return (overall, pron_detail), None


def _extract_transcript_from_rec_result(asr_result_json: str) -> str:
    """从录音文件识别 DescribeTaskStatus 返回的 Result JSON 中抽取合并文本。"""
    if not asr_result_json or not asr_result_json.strip():
        return ""
    s = asr_result_json.strip()
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        return s

    chunks: list[str] = []

    def visit(obj: Any) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("FinalSentence", "Text", "text") and isinstance(v, str) and v.strip():
                    chunks.append(v.strip())
                else:
                    visit(v)
        elif isinstance(obj, list):
            for it in obj:
                visit(it)

    visit(data)
    if chunks:
        return " ".join(chunks)
    if isinstance(data, dict):
        res = data.get("result")
        if isinstance(res, list):
            for item in res:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    chunks.append(item["text"].strip())
    return " ".join(chunks) if chunks else s[:8000]


def _asr_file_recognize_long_audio(raw_bytes: bytes) -> str:
    """
    腾讯云「录音文件识别」CreateRecTask：适合分钟级口语、约 5MB 内音频。
    使用 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（与智聆/控制台 API 密钥一致），非一句话识别。
    """
    if len(raw_bytes) > 5 * 1024 * 1024:
        raise ValueError("音频超过 5MB，请压缩时长或降低码率后再试")
    if not TENCENT_SECRET_ID or not TENCENT_SECRET_KEY:
        raise RuntimeError(
            "未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（录音文件识别需要与腾讯云控制台一致的 API 密钥）"
        )
    from tencentcloud.common import credential
    from tencentcloud.asr.v20190614 import asr_client, models

    cred = credential.Credential(TENCENT_SECRET_ID, TENCENT_SECRET_KEY)
    client = asr_client.AsrClient(cred, TENCENT_ASR_REGION)

    req = models.CreateRecTaskRequest()
    req.EngineModelType = ASR_ENGINE_MODEL
    req.ChannelNum = 1
    req.ResTextFormat = 2
    req.SourceType = 1
    req.Data = base64.b64encode(raw_bytes).decode("ascii")
    req.DataLen = len(raw_bytes)

    resp = client.CreateRecTask(req)
    if not resp.Data or not resp.Data.TaskId:
        raise RuntimeError("ASR 未返回 TaskId")
    task_id = resp.Data.TaskId

    q = models.DescribeTaskStatusRequest()
    q.TaskId = task_id

    deadline = time.time() + 180
    while time.time() < deadline:
        st = client.DescribeTaskStatus(q)
        if not st.Data:
            time.sleep(1.0)
            continue
        status = st.Data.Status
        if status == 2:
            return _extract_transcript_from_rec_result(st.Data.Result or "")
        if status == 3:
            raise RuntimeError(st.Data.ErrorMsg or "ASR 任务失败")
        time.sleep(1.0)

    raise TimeoutError("ASR 识别超时")


# ---- 腾讯云 TokenHub 批改（与 homework-miniapp-server 同源，供 standalone Interview / 上传录音）----


def _asr_plain_no_punct(s: str) -> str:
    if not s or not str(s).strip():
        return ""
    out: list[str] = []
    for ch in s:
        if unicodedata.category(str(ch)).startswith("P"):
            continue
        out.append(str(ch))
    return " ".join("".join(out).split())


CORRECTION_SYSTEM = """你是英语口语批改助手。根据学生口述转写文本，输出 JSON（不要 markdown）：
{
  "corrected_text": "修改后的英文（书面、自然）",
  "feedback_zh": "2～4句中文简短反馈",
  "highlights": [ { "issue": "问题类型", "hint": "一句中文提示" } ]
}
只输出 JSON。若转写几乎为空，corrected_text 与 feedback_zh 说明无法识别。"""


def _correction_model_candidates() -> list[str]:
    if DEEPSEEK_MODELS_ENV:
        return [x.strip() for x in DEEPSEEK_MODELS_ENV.split(",") if x.strip()]
    seen: set[str] = set()
    out: list[str] = []
    for m in (DEEPSEEK_MODEL, *_DEEPSEEK_FALLBACKS):
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _parse_correction_json_text(text: str) -> dict[str, Any]:
    t = (text or "").strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", t)
        if m:
            return json.loads(m.group(0))
        raise ValueError("模型未返回合法 JSON")


def _deepseek_correct(transcript: str) -> dict[str, Any]:
    from openai import OpenAI

    if not LKE_API_KEY or not LKE_API_KEY.strip():
        raise RuntimeError("未配置 LKE_API_KEY（TokenHub）")
    client = OpenAI(api_key=LKE_API_KEY, base_url=LKE_BASE_URL)
    messages = [
        {"role": "system", "content": CORRECTION_SYSTEM},
        {"role": "user", "content": f"学生口述转写：\n{transcript}"},
    ]
    last_err: Optional[Exception] = None
    for model in _correction_model_candidates():
        try:
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.3,
            )
        except Exception as e:
            last_err = e
            continue
        text = (completion.choices[0].message.content or "").strip()
        try:
            return _parse_correction_json_text(text)
        except (json.JSONDecodeError, ValueError) as e2:
            last_err = e2
            continue
    chain = " → ".join(_correction_model_candidates())
    raise RuntimeError(
        f"TokenHub 批改均失败（{chain}）。请检查 LKE_BASE_URL、LKE_API_KEY 与 DEEPSEEK_MODELS。最后: {last_err!r}"
    )


def _tokenhub_raw_to_standalone_json(transcript: str, raw: dict[str, Any]) -> dict[str, Any]:
    """将模型 JSON 转为 standalone.html 的 evalData 形状（与 asr-eval 成功时字段兼容）。"""
    corrected = (raw.get("corrected_text") or "").strip()
    feedback_zh = (raw.get("feedback_zh") or "").strip()
    highlights = raw.get("highlights")
    if not isinstance(highlights, list):
        highlights = []
    grammar_items: list[dict[str, str]] = []
    for h in highlights[:20]:
        if not isinstance(h, dict):
            continue
        issue = str(h.get("issue") or "").strip()
        hint = str(h.get("hint") or "").strip()
        reason = (issue + (("：" + hint) if hint else ""))[:220]
        grammar_items.append(
            {
                "original": "",
                "suggestion": hint,
                "reason_zh": reason or "要点",
            }
        )
    penalty = min(len(grammar_items) * 2, 40)
    overall = max(0, 100 - penalty)
    return {
        "ok": True,
        "transcript": transcript,
        "asrPlainNoPunct": _asr_plain_no_punct(transcript),
        "correctedTranscript": corrected,
        "grammarItems": grammar_items,
        "logicChain": [],
        "logicIssuesZh": [],
        "connectionCorrections": [],
        "overall": overall,
        "feedbackZh": feedback_zh,
        "correction": raw,
    }


@app.route("/api/interview-correct", methods=["POST", "OPTIONS"])
def interview_correct():
    """
    浏览器 Web Speech / 流式转写已得到文本时，只调 TokenHub 批改（不再上传整段音频给 ASR）。
    JSON: { "transcript": "..." }
    """
    if request.method == "OPTIONS":
        return ("", 204)
    if not LKE_API_KEY or not LKE_API_KEY.strip():
        return jsonify(ok=False, error="未配置 LKE_API_KEY（TokenHub），见 oral-python-backend/.env"), 500
    data = request.get_json(silent=True) or {}
    transcript = (data.get("transcript") or "").strip()
    if len(transcript) < 2:
        return jsonify(ok=False, error="transcript 过短或为空"), 400
    try:
        raw = _deepseek_correct(transcript)
        return jsonify(_tokenhub_raw_to_standalone_json(transcript, raw))
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 502


@app.route("/api/upload-audio-correct", methods=["POST", "OPTIONS"])
def upload_audio_correct():
    """
    上传整段口语：腾讯云「录音文件识别」CreateRecTask（非一句话、可至约 5MB/数分钟）
    + TokenHub 批改。
    form: audio (file)
    需 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（与控制台 API 密钥一致）；可选 ASR_ENGINE_MODEL=16k_en。
    """
    if request.method == "OPTIONS":
        return ("", 204)
    if not LKE_API_KEY or not LKE_API_KEY.strip():
        return jsonify(ok=False, error="未配置 LKE_API_KEY（TokenHub）"), 500
    if not TENCENT_SECRET_ID or not TENCENT_SECRET_KEY:
        return jsonify(
            ok=False,
            error="未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（录音文件识别 CreateRecTask 需要，与智聆所用密钥相同）",
        ), 500
    if "audio" not in request.files:
        return jsonify(ok=False, error="缺少音频文件 audio"), 400
    audio = request.files["audio"]
    if not audio or not audio.filename:
        return jsonify(ok=False, error="缺少音频文件 audio"), 400
    audio_bytes = audio.read()
    if len(audio_bytes) < 100:
        return jsonify(ok=False, error="音频过短或为空"), 400
    filename = (audio.filename or "upload.bin").lower()
    wav_b, conv_err = _normalize_audio_bytes_for_tencent_rec_file(audio_bytes, filename)
    if conv_err or not wav_b:
        return jsonify(
            ok=False,
            error="音频转码失败（本机或云端无法解析该文件）。可换用：Chrome 导出的 webm、标准 "
            "mp3/wav，或先在本机用播放器另存为 16kHz 单声道 WAV 再上传。详情："
            + (conv_err or "未知")[:500],
        ), 400
    audio_bytes = wav_b
    try:
        asr_t = _asr_file_recognize_long_audio(audio_bytes)
    except Exception as e:
        return jsonify(ok=False, error="ASR：" + str(e)[:800], transcript=None), 502
    asr_t = (asr_t or "").strip()
    if not asr_t:
        return jsonify(ok=False, error="ASR 未识别到有效文本，请检查录音或格式。"), 502
    try:
        raw = _deepseek_correct(asr_t)
        body = _tokenhub_raw_to_standalone_json(asr_t, raw)
        return jsonify(body)
    except Exception as e:
        return jsonify(ok=False, error=str(e), transcript=asr_t), 502


@app.route("/api/oral-eval", methods=["POST", "OPTIONS"])
def oral_eval():
    if request.method == "OPTIONS":
        return "", 204
    if "audio" not in request.files:
        return jsonify(ok=False, error="缺少音频文件 audio"), 400
    audio = request.files["audio"]
    if audio.filename == "":
        return jsonify(ok=False, error="缺少音频文件 audio"), 400

    ref_text = (request.form.get("refText") or "").strip()
    # Real Test 希望 45 秒自由发挥，而不是逐字对比 refText。
    # 这里 refText 只用来粗略判断语言中英，不再强制要求非空。
    # 若完全不传 refText，也允许评测继续。

    # 参考文本主要为英文则用 16k_en，否则 16k_zh（但 Real Test 场景一般为英文）
    server_engine_type = "16k_en"
    if ref_text and all("\u4e00" <= c <= "\u9fff" or c.isspace() or c in "，。！？" for c in ref_text[:20]):
        server_engine_type = "16k_zh"

    # 评测模式改为以前端传入为主，默认使用自由说模式 3，
    # 让 45 秒内的全部内容都参与评测，而不是按 refText 长度选句子/段落模式。
    eval_mode = (request.form.get("evalMode") or "3").strip()
    if not eval_mode.isdigit():
        eval_mode = "3"

    audio_bytes = audio.read()
    if len(audio_bytes) < 100:
        return jsonify(
            ok=False,
            error="音频数据过短或为空，请重新录音并确保麦克风正常。",
        ), 400
    filename = (audio.filename or "").lower()
    # 浏览器 MediaRecorder 多为 webm，接口仅支持 pcm/wav/mp3/speex，传 webm 会 4007
    voice_format = 0
    if filename.endswith(".mp3"):
        voice_format = 2
    elif filename.endswith(".wav"):
        voice_format = 1
    elif (
        filename.endswith(".webm")
        or filename.endswith(".weba")
        or "webm" in (request.content_type or "")
    ):
        wav_b, conv_err = _browser_audio_bytes_to_wav_16k_mono(audio_bytes)
        if conv_err or not wav_b:
            return jsonify(ok=False, error="音频转 wav 失败：" + (conv_err or "未知错误")), 400
        audio_bytes = wav_b
        voice_format = 1

    result, err = _call_soe_websocket(
        audio_bytes,
        ref_text,
        eval_mode=eval_mode,
        server_engine_type=server_engine_type,
        voice_format=voice_format,
    )
    if err:
        return jsonify(ok=False, error=err), 500
    overall, pron_detail = result if result else (None, None)
    return jsonify(
        ok=True,
        overall=overall,
        pronDetail=pron_detail,
        raw=pron_detail,
    )


@app.route("/api/grammar-check", methods=["POST"])
def grammar_check():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify(ok=False, error="缺少待检查文本 text"), 400

    try:
        resp = requests.post(
            LT_API_URL,
            data={"text": text, "language": "en-US"},
            timeout=10,
        )
        resp.raise_for_status()
        lt = resp.json()
        return jsonify(ok=True, matches=lt.get("matches", []))
    except Exception as e:
        return jsonify(ok=False, error=f"Grammar check failed: {e}"), 500


@app.route("/api/llm-grammar", methods=["POST", "OPTIONS"])
def llm_grammar():
    """使用本地 Ollama 对 transcript 做语法/词法适用性检查。"""
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify(ok=False, error="缺少待检查文本 text"), 400
    items = _call_ollama_grammar_items(text)
    return jsonify(ok=True, items=items)


@app.route("/api/asr-transcript", methods=["POST", "OPTIONS"])
def asr_transcript_only():
    """
    仅转写：浏览器上传音频 → 腾讯云「录音文件识别」CreateRecTask（与 upload-audio-correct 同源）。
    LNR 的 oral-eval 只走智聆 SOE，不在此接口。需 TENCENT_SECRET_ID / TENCENT_SECRET_KEY。
    """
    if request.method == "OPTIONS":
        return "", 204
    if "audio" not in request.files:
        return jsonify(ok=False, error="缺少音频文件 audio"), 400
    audio = request.files["audio"]
    if not audio or not audio.filename:
        return jsonify(ok=False, error="缺少音频文件 audio"), 400
    if not TENCENT_SECRET_ID or not TENCENT_SECRET_KEY:
        return jsonify(
            ok=False,
            error="未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（录音文件识别 CreateRecTask 需要，与智聆所用密钥一致）",
        ), 500

    audio_bytes = audio.read()
    if len(audio_bytes) < 100:
        return jsonify(ok=False, error="音频数据过短或为空。"), 400

    filename = (audio.filename or "upload.bin").lower()
    wav_b, conv_err = _normalize_audio_bytes_for_tencent_rec_file(audio_bytes, filename)
    if conv_err or not wav_b:
        return jsonify(
            ok=False,
            error="音频转码失败：" + (conv_err or "未知错误")[:500],
        ), 400
    try:
        transcript = (_asr_file_recognize_long_audio(wav_b) or "").strip()
    except Exception as e:
        return jsonify(ok=False, error="ASR：" + str(e)[:800]), 502
    if not transcript:
        return jsonify(ok=False, error="ASR 未识别到有效文本，请检查录音或格式。"), 400
    return jsonify(ok=True, transcript=transcript)


@app.route("/api/asr-eval", methods=["POST", "OPTIONS"])
def asr_eval():
    """使用腾讯云录音文件识别（CreateRecTask）转写 + 本地 Ollama 做语法检查；非一句话识别。"""
    if request.method == "OPTIONS":
        return "", 204
    if "audio" not in request.files:
        return jsonify(ok=False, error="缺少音频文件 audio"), 400
    audio = request.files["audio"]
    if audio.filename == "":
        return jsonify(ok=False, error="缺少音频文件 audio"), 400

    if not TENCENT_SECRET_ID or not TENCENT_SECRET_KEY:
        return jsonify(
            ok=False,
            error="未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（录音文件识别 CreateRecTask 需要，与智聆所用密钥一致）",
        ), 500

    audio_bytes = audio.read()
    if len(audio_bytes) < 100:
        return jsonify(ok=False, error="音频数据过短或为空，请重新上传。"), 400

    filename = (audio.filename or "upload.bin").lower()
    wav_b, conv_err = _normalize_audio_bytes_for_tencent_rec_file(audio_bytes, filename)
    if conv_err or not wav_b:
        return jsonify(
            ok=False,
            error="音频转码失败：" + (conv_err or "未知错误")[:500],
        ), 400

    try:
        transcript = (_asr_file_recognize_long_audio(wav_b) or "").strip()
    except Exception as e:
        return jsonify(ok=False, error="ASR：" + str(e)[:800]), 502

    if not transcript:
        return jsonify(ok=False, error="ASR 未识别到有效文本，请检查录音质量。"), 400

    # 语法/逻辑检查（本地大模型）：给错误列表 + 修改后范文 + 自然分句
    grammar_items = []
    corrected_transcript = ""
    segments = []
    logic_chain = []
    connection_corrections = []
    logic_issues_zh = []
    try:
        (
            grammar_items,
            corrected_transcript,
            segments,
            logic_chain,
            connection_corrections,
            logic_issues_zh,
        ) = _call_ollama_grammar_pack(transcript)
    except Exception:
        grammar_items = []
        corrected_transcript = ""
        segments = []
        logic_chain = []
        connection_corrections = []
        logic_issues_zh = []

    # 简单给一个“自定义总分”：目前用 100 当基础分，按语法/词法错误数量做扣分
    penalty = min(len(grammar_items) * 2, 40)
    overall = max(0, 100 - penalty)

    return jsonify(
        ok=True,
        overall=overall,
        transcript=transcript,
        asrPlainNoPunct=_asr_plain_no_punct(transcript),
        grammarItems=grammar_items,
        correctedTranscript=corrected_transcript,
        correctedSegments=segments,
        logicChain=logic_chain,
        logicIssuesZh=logic_issues_zh,
        connectionCorrections=connection_corrections,
    )


_PRACTICE_BANK_CACHE = None


def _practice_bank_paths():
    """Interview 题库 docx 与磁盘缓存 JSON 路径（均在 oral-python-backend 上一级项目目录）。"""
    interview_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    topic_book = os.path.join(interview_root, "topic_practice_booklet.docx")
    guide_book = os.path.join(interview_root, "speaking_guide_v3.docx")
    cache_path = os.path.join(interview_root, "practice-bank.cache.json")
    return interview_root, topic_book, guide_book, cache_path


def _practice_bank_cache_is_fresh(cache_path, topic_book, guide_book):
    """缓存文件存在且不比任一 docx 旧则视为可用。"""
    if not os.path.isfile(cache_path):
        return False
    try:
        cache_mtime = os.path.getmtime(cache_path)
    except OSError:
        return False
    for p in (topic_book, guide_book):
        try:
            if os.path.isfile(p) and os.path.getmtime(p) > cache_mtime:
                return False
        except OSError:
            pass
    return True


def _load_practice_bank_from_disk(cache_path):
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            d = json.load(f)
        if (
            isinstance(d, dict)
            and d.get("topicCategories")
            and d.get("typeCategories")
        ):
            return {
                "topicCategories": d["topicCategories"],
                "typeCategories": d["typeCategories"],
            }
    except Exception:
        pass
    return None


def _save_practice_bank_to_disk(cache_path, data):
    try:
        tmp = cache_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, cache_path)
    except Exception:
        pass


def _extract_docx_ordered_text(doc_path: str):
    """按文档出现顺序抽取段落与表格单元格文本。"""
    import docx
    from lxml import etree

    doc = docx.Document(doc_path)
    items = []
    body = doc._element.body
    for child in body:
        tag = etree.QName(child.tag).localname
        if tag == "p":
            t = "".join(child.xpath(".//w:t/text()"))
            t = (t or "").strip()
            t = re.sub(r"\s+", " ", t).strip()
            if t:
                items.append(t)
        elif tag == "tbl":
            for row in child.xpath(".//w:tr"):
                for cell in row.xpath(".//w:tc"):
                    t = "".join(cell.xpath(".//w:t/text()"))
                    t = (t or "").strip()
                    t = re.sub(r"\s+", " ", t).strip()
                    if t:
                        items.append(t)
    return items


def _build_practice_bank():
    """
    从：
      - topic_practice_booklet.docx（按话题分类）
      - speaking_guide_v3.docx（按设问方式分类）
    抽取问题并返回前端可直接使用的数据结构。
    """
    _, topic_book, guide_book, _ = _practice_bank_paths()

    topic_items = _extract_docx_ordered_text(topic_book)
    guide_items = _extract_docx_ordered_text(guide_book)

    # topic: Topic 1 运动与健身 Exercise & Fitness
    pat_topic = re.compile(r"^Topic\s+(\d+)\b", re.IGNORECASE)

    def is_topic_question(t: str):
        if not t:
            return False
        if "… " in t or "…" in t or "..." in t:
            return False
        if re.match(r"^Type\s+[A-F]", t):
            return False
        # 以问号判断口语访谈题
        return ("?" in t or "？" in t) and len(t) >= 25

    topic_categories_by_id = {}
    topic_order = []
    seen_q_by_topic = {}
    current = None
    for t in topic_items:
        m = pat_topic.search(t)
        if m:
            tid = f"topic{m.group(1)}"
            if tid not in topic_categories_by_id:
                topic_categories_by_id[tid] = {"id": tid, "title": t, "questions": []}
                topic_order.append(tid)
                seen_q_by_topic[tid] = set()
            else:
                # 后续再出现同 topic 标题时，优先用更完整的标题覆盖
                if not topic_categories_by_id[tid].get("questions"):
                    topic_categories_by_id[tid]["title"] = t
            current = topic_categories_by_id[tid]
            continue
        if current and is_topic_question(t) and t not in seen_q_by_topic[current["id"]]:
            current["questions"].append(
                {"id": f"{current['id']}_q{len(current['questions'])+1}", "refText": t}
            )
            seen_q_by_topic[current["id"]].add(t)

    # type: Type A / Type B ...
    pat_type = re.compile(r"^Type\s+([A-F])\b", re.IGNORECASE)
    Q_START = re.compile(
        r"^(Do you|Did you|Imagine|What|Can you|Some people|How often|How do|When|Where|Who|Why|Which|Could|Would|Tell me about|Think of a|Do you have)",
        re.IGNORECASE,
    )

    def is_type_question(t: str):
        if not t:
            return False
        if "…" in t or "..." in t:
            return False
        if re.match(r"^Type\s+[A-F]", t):
            return False
        if "What is this question type" in t:
            return False
        if "题型说明" in t:
            return False
        if "?" not in t and "？" not in t:
            return False
        if not Q_START.match(t):
            return False
        return len(t) >= 25

    type_categories_by_id = {}
    type_order = []
    seen_t_by_type = {}
    current_t = None
    for t in guide_items:
        m = pat_type.match(t)
        if m:
            tid = f"type{m.group(1).upper()}"
            if tid not in type_categories_by_id:
                type_categories_by_id[tid] = {"id": tid, "title": t, "questions": []}
                type_order.append(tid)
                seen_t_by_type[tid] = set()
            else:
                if not type_categories_by_id[tid].get("questions"):
                    type_categories_by_id[tid]["title"] = t
            current_t = type_categories_by_id[tid]
            continue
        if current_t and is_type_question(t) and t not in seen_t_by_type[current_t["id"]]:
            # speaking guide 建议每类 20 题，这里做上限裁剪，避免多抓到标题/额外说明
            if len(current_t["questions"]) >= 20:
                continue
            current_t["questions"].append(
                {"id": f"{current_t['id']}_q{len(current_t['questions'])+1}", "refText": t}
            )
            seen_t_by_type[current_t["id"]].add(t)

    topic_categories = [topic_categories_by_id[tid] for tid in topic_order]
    type_categories = [type_categories_by_id[tid] for tid in type_order]

    return {"topicCategories": topic_categories, "typeCategories": type_categories}


@app.route("/api/practice-bank", methods=["GET", "OPTIONS"])
def practice_bank():
    if request.method == "OPTIONS":
        return "", 204
    global _PRACTICE_BANK_CACHE
    if (
        _PRACTICE_BANK_CACHE is None
        or not _PRACTICE_BANK_CACHE.get("topicCategories")
        or not _PRACTICE_BANK_CACHE.get("typeCategories")
    ):
        _, topic_book, guide_book, cache_path = _practice_bank_paths()
        if _practice_bank_cache_is_fresh(cache_path, topic_book, guide_book):
            loaded = _load_practice_bank_from_disk(cache_path)
            if loaded:
                _PRACTICE_BANK_CACHE = loaded
        if (
            _PRACTICE_BANK_CACHE is None
            or not _PRACTICE_BANK_CACHE.get("topicCategories")
            or not _PRACTICE_BANK_CACHE.get("typeCategories")
        ):
            _PRACTICE_BANK_CACHE = _build_practice_bank()
            _save_practice_bank_to_disk(cache_path, _PRACTICE_BANK_CACHE)
    return jsonify(ok=True, **_PRACTICE_BANK_CACHE)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug_mode = str(os.environ.get("DEBUG_MODE", "")).strip().lower() in ["1", "true", "yes", "on"]
    # 开发模式：保存 app.py 等源码后自动重启（比默认 stat 轮询更稳，尤其 macOS）
    _watch_files = []
    _env_path = os.path.join(_APP_DIR, ".env")
    if os.path.isfile(_env_path):
        _watch_files.append(_env_path)
    _run_kw = dict(host="0.0.0.0", port=port, debug=debug_mode, use_reloader=debug_mode)
    if debug_mode and _watch_files:
        _run_kw["extra_files"] = _watch_files
    try:
        if debug_mode:
            import watchdog  # noqa: F401  # pip install watchdog

            _run_kw["reloader_type"] = "watchdog"
    except ImportError:
        pass
    app.run(**_run_kw)
