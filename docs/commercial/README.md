# 商业化与账号分层：交付物索引

本目录对应「官网 + 体验版 + 付费完整版」可实施性评估的落地文档与 PoC。

| 文档 | 说明 |
|------|------|
| [PRD-tiers.md](./PRD-tiers.md) | 体验版 vs 付费版功能边界（题量、批改、Listen&Repeat、次数） |
| [biz-pay-sms-cn.md](./biz-pay-sms-cn.md) | 大陆主体、微信/支付宝、短信对接清单与顺序 |
| [data-model-draft.md](./data-model-draft.md) | `users` / `orders` / `entitlements` 草案与 Demo 隔离 |
| [teacher-portal-privacy.md](./teacher-portal-privacy.md) | 教师端不公开的链接、SEO、子域与鉴权策略 |
| [POC-README.md](./POC-README.md) | 本地启用 `POC_MODE=1` 后的短信与支付模拟接口说明 |

PoC 代码位置：[`server/poc-mock.js`](../../server/poc-mock.js)（仅 `POC_MODE=1` 时挂载）。
