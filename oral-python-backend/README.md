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

# 可选：Listen & Repeat「真实口述」转写（腾讯云一句话识别 ASR）
# 与智聆 SOE 不同：SOE 是照着参考句打发音分，Words 往往是整句对齐，不是真实说了什么。
# 配置后 /api/oral-eval 会多返回 asrTranscript 字段。
TENCENT_ASR_SECRET_ID=
TENCENT_ASR_SECRET_KEY=
TENCENT_ASR_REGION=ap-guangzhou
```

需要安装腾讯云 SDK（若未装）：`pip install tencentcloud-sdk-python`

- **AppID**：在腾讯云「口语评测（新版）」控制台开通服务后，在「API 密钥管理」页面获取（与 SecretId/SecretKey 同页）。
- 智聆 **TENCENT** 三个必填，否则 `/api/oral-eval` 会返回“未配置”错误。
- **ASR 密钥**（可选）：与「语音识别」控制台 ASR 的 SecretId/SecretKey 一致；不配则仅智聆打分，转写仍可能显示为参考句对齐。

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
