# 数据模型草案：users / orders / entitlements 与 Demo 隔离

与现有 Supabase 表（如 `users`、`assignments`、`student_submissions`）并存时的**扩展方向**。表名可按你现有命名微调；以下为逻辑模型。

## 1. 用户与身份

### `users`（扩展现有）

当前：用户名 + 明文密码 + `role`（student/teacher）。

建议扩展（付费用户与手机号）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 已有 |
| `username` | text | 保留；共享账号仍为 `studentaccount` |
| `phone` | text, nullable, unique | 大陆手机 E.164 或 11 位，唯一 |
| `phone_verified_at` | timestamptz | 最近一次短信验证成功时间 |
| `password_hash` | text, nullable | 新用户建议 bcrypt；历史数据可逐步迁移 |
| `role` | text | `student` / `teacher` / `admin` |
| `tier` | text | `demo` / `paid` / `trial`（可选） |
| `tenant_id` | uuid, nullable | 多租户（机构）时用 |

**兼容策略**：

- 共享演示账号：固定 `username=studentaccount`，`tier=demo`，**不与手机号混用同一套权限**（见下「隔离」）。
- 付费用户：以 `phone` 为主键身份，可另设 `username` 展示名或等于手机号掩码。

## 2. 权益（Entitlements）

### `entitlements`（新表，或并入 `subscriptions`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → users.id |
| `plan` | text | 如 `monthly_pro` |
| `valid_from` | timestamptz | |
| `valid_until` | timestamptz | 订阅结束 |
| `features` | jsonb | 如 `{"interview": "full", "lr_groups": 50, "asr_monthly": 200}` |
| `source` | text | `wechat` / `alipay` / `manual` |

服务端在 `/api/student/submit-audio`、Python 转发等**昂贵路径**前查询：当前用户是否 `valid_until > now()` 且 feature 允许。

## 3. 订单（Orders）

### `orders`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | |
| `user_id` | uuid, nullable | 下单时可能仅手机号 |
| `out_trade_no` | text, unique | 商户订单号 |
| `channel` | text | `wechat` / `alipay` |
| `amount_fen` | int | 金额分 |
| `status` | text | `pending` / `paid` / `closed` / `refunded` |
| `paid_at` | timestamptz | |
| `channel_transaction_id` | text | 渠道单号 |
| `raw_notify` | jsonb | 最近一次验签后的回调原文（脱敏） |

**幂等**：`out_trade_no` 唯一；回调重复投递只更新一次权益。

## 4. Demo 与生产隔离

| 策略 | 说明 |
|------|------|
| `tenant_id` | 演示环境 `tenant_id = 固定 demo UUID`；生产用户另一 tenant |
| 表级前缀 | 演示作业写入 `assignments` 但 `meta->>'env'='demo'`（查询时过滤） |
| 独立 Supabase 项目 | 最强隔离，运维成本高 |

推荐：**同一库 + `tenant_id` 或 `env` 字段**，便于迁移；演示数据可定时 job 清理。

## 5. 与现有「姓名匹配作业」的关系

- **不变**：学生仍用「姓名」匹配教师布置的 `assignments`（若保留该模式）。
- **新增**：`tier=paid` 时才允许某些 API（全量题库、无限批改等）；`demo` 仅允许白名单题目 ID 或限次。

## 6. 迁移顺序（实施时）

1. 加表 `orders`、`entitlements`；`users` 加 `phone`、`password_hash`（可空）。
2. 支付回调写 `orders` + `entitlements`。
3. 短信 OTP 登录：验证通过后 upsert `users` by phone，发 JWT 或 session。
4. 逐步废弃明文密码（仅教师端与旧 student 路径）。
