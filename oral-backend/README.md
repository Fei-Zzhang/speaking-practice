# oral-backend（智聆口语评测后端）

这个目录是给 `standalone.html` 的 Real Test 使用的 **简单 Node.js 后端**，用于对接腾讯云「智聆口语评测」接口。

## 1. 安装依赖

在本目录下执行：

```bash
npm install express multer dotenv tencentcloud-sdk-nodejs uuid
```

## 2. 配置环境变量

在本目录下创建 `.env` 文件（**不要提交到代码仓库，也不要放在前端**）：

```bash
TENCENT_SECRET_ID=你的SecretId
TENCENT_SECRET_KEY=你的SecretKey
TENCENT_REGION=ap-guangzhou   # 与控制台资源所在地域一致
PORT=3000
```

SecretId / SecretKey 可以在腾讯云控制台的「访问管理（CAM）」→「访问密钥」里查看。

## 3. 启动后端

```bash
npm start
```

默认会在 `http://localhost:3000` 启动一个服务，并暴露一个接口：

- `POST /api/oral-eval`：接收前端上传的音频 + 参考文本，转发到智聆口语评测，并把评分结果返回给前端。

## 4. 在哪里查智聆口语评测的 API

你可以在腾讯云控制台和文档里找到完整说明：

- 控制台路径：登录腾讯云 → 在顶部搜索框输入「**智聆口语评测**」→ 进入产品页 → 左侧导航中有「API 文档」。
- 官方文档入口（口语评测 Soe）：`https://cloud.tencent.com/document/product/884`
  - **API 概览**：`https://cloud.tencent.com/document/product/884/19310`
  - **Node.js SDK 示例（TransmitOralProcessWithInit）**：`https://cloud.tencent.com/document/product/884/78789`
  - 常用实践（带初始化的发音数据传输接口）：`https://cloud.tencent.com/document/product/884/32605`

建议先打开「Node.js SDK 示例」和「API Explorer」，用你的账号跑一遍 `TransmitOralProcessWithInit`，看实际返回的 JSON 字段，然后再对照修改 `server.js` 里对 `result.PronContent` / `result.Words` 的取值。

