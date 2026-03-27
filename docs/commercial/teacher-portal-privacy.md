# 教师端不公开：发布与访问策略

目标：**官网与公开链接中不出现教师端入口**；降低被爬虫与误访问的概率。以下为分层方案，可按投入递增采用。

## 1. 运营与链接策略（零成本）

- 官网、公众号、对外 PDF **只放学生端或官网域名**；不放 `teacher.html`、不放 `?portal=teacher`。
- 教师入口仅通过 **私信/企业微信/邮件** 发给内部老师。

## 2. 前端与 SEO（低成本）

- 在**官网根目录**（或 GitHub Pages 站点根）放置 `robots.txt`：

```txt
User-agent: *
Disallow: /teacher.html
Disallow: /*portal=teacher*
```

说明：`Disallow` 对带 query 的规则**因爬虫而异**；更可靠的是教师页独立路径且整站营销域与练习域分离（见下）。

- 学生站 `index.html` / 落地页 **不要链接** 到教师页。

## 3. 子域分离（推荐）

| 域名用途 | 示例 | 内容 |
|----------|------|------|
| 营销官网 | `www.example.com` | 介绍、小技巧、付费引导 |
| 学生练习 | `app.example.com` | `standalone.html?portal=student` |
| 教师管理 | `teacher.example.com` | `standalone.html?portal=teacher` 或反向代理到内网 |

教师子域 **不写入** 公开 sitemap；可在 DNS 层仅内网解析或 VPN。

## 4. 访问控制（中成本）

- **HTTP Basic Auth**：Nginx/Cloudflare 在 `teacher.*` 上配置用户名密码，仅团队知晓。
- **IP 白名单**：仅学校出口 IP 可访问（适合固定办公网）。
- **Cloudflare Access / 零信任**：按邮箱或 IdP 登录后再到达源站。

## 5. 与当前仓库的对应关系

- 入口文件：仓库根目录 [`teacher.html`](../../teacher.html) 仅重定向到 `standalone.html?portal=teacher`。
- 部署时可将 **教师 HTML 仅部署到受控子域**，公共 Pages 仓库可不包含 `teacher.html`（或构建时剔除）——需单独流水线时再定。

## 6. 检查清单

- [ ] 对外物料中无教师链接  
- [ ] `robots.txt` / `noindex`（若需要）  
- [ ] 教师子域鉴权（可选）  
- [ ] 定期审计 GitHub 仓库是否 Public 泄露 `TEACHER_REGISTER_SECRET`（密钥仅环境变量）
