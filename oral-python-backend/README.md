# oral-python-backend（Real Test 口语评测 · Python）

对接前端 `standalone.html` 的 Real Test，使用腾讯云「智聆口语评测（新版）」接口。

## 依赖

- Python 3.10+（建议 3.10 或 3.11）
- **`python-docx`**：教师端 Interview 题库接口 `GET /api/practice-bank` 会从 docx 解析题目；未安装时会报 `No module named 'docx'`。

## 第一步：安装依赖

```bash
cd oral-python-backend
pip3 install -r requirements.txt
```

若浏览器录音为 **webm**，后端会用 pydub 转为 wav 再评测，需本机已安装 **ffmpeg**（如 `brew install ffmpeg`）。未装 ffmpeg 时提交 webm 会提示安装。

或使用虚拟环境（推荐）：

```bash
cd oral-python-backend
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 第二步：配置密钥

在项目根目录新建 `.env` 文件（勿提交到仓库）：

```bash
TENCENT_APP_ID=你的AppID
TENCENT_SECRET_ID=你的SecretId
TENCENT_SECRET_KEY=你的SecretKey
PORT=5001

# 可选：录音文件识别地域（默认 ap-guangzhou）
TENCENT_ASR_REGION=ap-guangzhou
# 可选：CreateRecTask 引擎，默认 16k_en
ASR_ENGINE_MODEL=16k_en
```

需要安装腾讯云 SDK（若未装）：`pip install tencentcloud-sdk-python`

- **主账号 API 密钥一套即可**：`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` 同时用于 **智聆 SOE**（需配 `TENCENT_APP_ID`）和 **录音文件 ASR**（CreateRecTask）。
- **Listen & Repeat**：仅 **`POST /api/oral-eval` → 智聆 SOE**（发音分 + 逐词对齐），**不再**接一句话识别或其它 ASR。
- **其余转写**（头脑风暴、上传批改、`/api/asr-transcript` 等）：**录音文件识别 CreateRecTask**，同样用 **`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`**。

### 智聆 vs 语音识别（不是同一个产品）

| 能力 | 产品 | 用途 | 本项目中 |
|------|------|------|----------|
| 智聆 SOE | 口语评测（新版） | 对照参考句打发音分、逐词得分 | **仅 LNR** `/api/oral-eval` |
| 录音文件 ASR | 语音识别 CreateRecTask | 把整段录音转成文字 | 头脑风暴、Interview 上传、批改等 |
| 一句话识别 | SentenceRecognition | 短音频快速转写 | **本项目已不用** |

### Interview：腾讯云「实时语音识别」流式（由 Node 签发 URL）

- **不在本 Python 服务内实现**。`standalone.html` Interview「题目练习」中的 **腾讯云实时转写（流式）** 由浏览器直连 `wss://asr.cloud.tencent.com`，鉴权 URL 由 **`server/` Node** 的 **`GET /api/tencent-asr/sign`** 生成。
- 请在 **`server/.env`** 配置 **`TENCENT_ASR_APP_ID`**（可与主账号 AppID 相同）、**`TENCENT_ASR_SECRET_ID`**、**`TENCENT_ASR_SECRET_KEY`**（可与上面 **`TENCENT_SECRET_*`** 填同一对密钥）。
- **Listen & Repeat** 只走 Python **`/api/oral-eval`（智聆）**，不依赖 Node 流式 ASR。

### `POST /api/asr-transcript`（纯转写、无批改）

- **录音文件识别 CreateRecTask**；需 **`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`**。无需 TokenHub。

### `POST /api/upload-audio-correct`（standalone 上传录音）

- **录音文件识别 CreateRecTask**（约 **5MB** 内）；需 **`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`**；可选 **`ASR_ENGINE_MODEL`**。转写后 **TokenHub** 批改（`LKE_API_KEY` 等）。

### 与本目录 `POST /api/asr-eval` 的区别

- **`/api/asr-eval`**：**CreateRecTask** 转写 + 本地 Ollama（若开启）语法包；密钥同上。
- **`/api/oral-eval`（LNR）**：**仅智聆 SOE**，不返回 ASR 转写字段。
- **实时流式**：Node 签名 + 浏览器 PCM；与 LNR 无关。

## 第三步：启动服务

```bash
python app.py
```

服务会在 **http://localhost:5001** 启动（默认用 5001，避免与 macOS 隔空播放占用的 5000 冲突）。

开发时**不必每次手搓重启**：`app.py` 以 `debug` 模式运行，并已启用 **watchdog** 热重载；修改并保存 `app.py` 等源码后，进程会自动重启。若依赖未装齐，执行一次：`pip install -r requirements.txt`（含 `watchdog`）。

## 第四步：前端改端口

在 `standalone.html` 里将：

```javascript
const API_BASE = 'http://localhost:3000';
```

改为：

```javascript
const API_BASE = 'http://localhost:5001';
```

刷新页面后，Real Test 录音提交会打到 Python 后端的 `/api/oral-eval`。

## 第五步：接入腾讯云口语评测（新版）

- 文档：[智聆口语评测（新版）相关接口](https://cloud.tencent.com/document/product/1774/107497)
- 协议：WSS，需用 SecretId/SecretKey 做 HMAC-SHA1 签名，URL 形如：  
  `wss://soe.cloud.tencent.com/soe/api/<appid>?secretid=...&timestamp=...&signature=...&ref_text=...&eval_mode=...` 等
- 录音模式：`rec_mode=1`，可一次性上传整段音频，再发 `{"type":"end"}`，解析返回 JSON 得到得分。

在 `app.py` 的 `oral_eval()` 中：用 `audio_bytes`、`ref_text` 和 `.env` 中的配置，按文档实现 WebSocket 握手与音频上传，将解析出的 `overall`、`result` 等填入返回的 `jsonify()`。
