# oral-java-backend（Real Test 口语评测 · Java）

对接前端 `standalone.html` 的 Real Test，使用腾讯云「智聆口语评测（新版）」接口。

## 第一步：已创建项目骨架

- Spring Boot 3.2，Java 17
- 接口：`POST /api/oral-eval`（接收 `audio` + `refText`）
- 当前为占位实现，返回 `ok: true`，尚未调用腾讯云

## 第二步：配置密钥与 AppID

1. 在项目根目录（与 `pom.xml` 同级）新建 `.env` 或直接设置环境变量：
   - `TENCENT_APP_ID`：口语评测（新版）控制台中的 **AppID**（与控制台「API 密钥管理」一致）
   - `TENCENT_SECRET_ID`
   - `TENCENT_SECRET_KEY`

2. 或在 `src/main/resources/application.yml` 里直接写（勿提交到仓库）：
   ```yaml
   tencent:
     app-id: 你的AppID
     secret-id: 你的SecretId
     secret-key: 你的SecretKey
   ```

## 第三步：安装 Maven（若未安装）

本机需先有 Maven，否则会报 `command not found: mvn`。

**macOS（Homebrew）：**

```bash
brew install maven
```

安装后在终端执行 `mvn -v`，能输出版本号即表示可用。

## 第四步：运行后端

```bash
cd oral-java-backend
mvn spring-boot:run
```

服务会在 `http://localhost:8080` 启动。

## 第五步：前端改端口（可选）

若前端仍指向 3000，在 `standalone.html` 里将：

```javascript
const API_BASE = 'http://localhost:3000';
```

改为：

```javascript
const API_BASE = 'http://localhost:8080';
```

然后刷新页面，Real Test 录音提交会打到 Java 后端的 `/api/oral-eval`。

## 第六步：接入腾讯云口语评测（新版）

- 官方文档：[智聆口语评测（新版）相关接口](https://cloud.tencent.com/document/product/1774/107497)
- 协议：WSS，需签名；支持「录音识别」模式（一次性上传音频）。
- Java 示例 / SDK 下载：控制台 [口语评测（新版）→ SDK 下载](https://console.cloud.tencent.com/soenew/download)，或文档中的 Java 示例链接。

在 `OralEvalController` 的 `oralEval` 方法中：读取 `audio.getBytes()`，按文档用 AppID/SecretId/SecretKey 做签名并建立 WebSocket，发送音频并解析返回的 JSON，将 `overall`、`pronDetail` 等填入响应 body。
