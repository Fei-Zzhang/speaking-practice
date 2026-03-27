# PoC：短信 OTP + 模拟支付回调（联调说明）

本 PoC 用于验证「**手机号验证码 → 模拟支付成功 → 内存权益**」链路，**不写入真实微信/支付宝、不连真实短信网关**。生产环境请关闭。

## 启用方式

在 [`server/.env`](../../server/.env)（或部署环境变量）中设置：

```env
POC_MODE=1
```

重启 Node 后，控制台应出现：

`[POC] POC_MODE=1：已挂载 /api/poc/*`

## 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/poc/health` | PoC 存活检查 |
| POST | `/api/poc/sms/send` | Body: `{ "phone": "13800138000" }` → 验证码打印在 **服务端日志** |
| POST | `/api/poc/sms/verify` | Body: `{ "phone": "...", "code": "123456" }` → 返回假 `token` |
| POST | `/api/poc/pay/mock-callback` | Body: `{ "phone": "...", "orderId": "可选" }` → 写入内存权益（30 天 mock） |
| GET | `/api/poc/entitlement?phone=13800138000` | 查询该手机号的 mock 权益 |

## curl 示例

```bash
export API=http://localhost:3003

curl -s "$API/api/poc/sms/send" -H 'Content-Type: application/json' -d '{"phone":"13800138000"}'
# 看 Node 日志里的 6 位 code

curl -s "$API/api/poc/sms/verify" -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","code":"REPLACE"}'

curl -s "$API/api/poc/pay/mock-callback" -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","orderId":"test-001"}'

curl -s "$API/api/poc/entitlement?phone=13800138000"
```

## 与正式上线的关系

- 正式环境：`POC_MODE` 不设置或 `0`；接入腾讯云/阿里云短信与微信/支付宝回调后，在 [`data-model-draft.md`](./data-model-draft.md) 所述表上落库。
- 当前 PoC **不修改**现有 `/api/auth/login` 与学生作业表结构；仅额外挂载路由，便于并行开发。

## 实现位置

- 代码：[`server/poc-mock.js`](../../server/poc-mock.js)
- 挂载：[`server/server.js`](../../server/server.js)（判断 `POC_MODE===1`）
