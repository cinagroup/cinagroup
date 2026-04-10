# ☁️ Cloudflare Pages 部署完整指南

## 📋 部署架构

```
GitHub (cinagroup/homepage)
    ↓ (Git Push)
GitHub Actions (自动触发)
    ↓ (npm run build)
Cloudflare Pages (构建 + 部署)
    ↓ (全球 CDN)
https://cinagroup.com
```

---

## ✅ 已完成配置

| 文件 | 说明 | 状态 |
|------|------|------|
| `.github/workflows/cloudflare-deploy.yml` | GitHub Actions 工作流 | ✅ 已推送 |
| `cloudflare-pages.toml` | Cloudflare 配置 | ✅ 已推送 |
| `wrangler.toml` | Wrangler CLI 配置 | ✅ 已推送 |
| `vercel.json` | Vercel 备用配置 | ✅ 已存在 |
| `netlify.toml` | Netlify 备用配置 | ✅ 已存在 |

---

## 🚀 部署方式一：GitHub Actions 自动部署（推荐）

### 步骤 1：创建 Cloudflare 账号

1. 访问 https://dash.cloudflare.com/sign-up
2. 注册免费账号
3. 验证邮箱

### 步骤 2：获取 API Token

1. 登录 Cloudflare Dashboard
2. 点击右上角头像 → **My Profile**
3. 左侧菜单 → **API Tokens**
4. 点击 **Create Token**
5. 选择 **Edit Cloudflare Workers** 模板
6. 配置权限：
   - **Account.Cloudflare Pages** = Edit
   - **Account.Account Settings** = Read
7. 点击 **Continue to summary**
8. 点击 **Create Token**
9. **复制 Token**（只显示一次！）

### 步骤 3：获取 Account ID

1. 在 Cloudflare Dashboard 右侧边栏找到 **Account ID**
2. 或者访问：https://dash.cloudflare.com
3. 复制 Account ID（32 位字符串）

### 步骤 4：配置 GitHub Secrets

1. 打开仓库：https://github.com/cinagroup/homepage
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**
4. 添加以下 Secrets：

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | 步骤 2 创建的 Token |
| `CLOUDFLARE_ACCOUNT_ID` | 步骤 3 获取的 Account ID |

### 步骤 5：在 Cloudflare 创建项目

1. 登录 https://dash.cloudflare.com
2. 左侧菜单 → **Workers & Pages**
3. 点击 **Create application** → **Pages** 标签
4. 选择 **Connect to Git**
5. 选择 `cinagroup/homepage` 仓库
6. 配置构建设置：
   - **Production branch**: `main`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
7. 点击 **Save and Deploy**

### 步骤 6：配置自定义域名

1. 在 Cloudflare Pages 项目页面
2. 点击 **Custom domains** 标签
3. 点击 **Set up a custom domain**
4. 输入 `cinagroup.com`
5. 点击 **Continue**
6. Cloudflare 会自动配置 DNS 和 SSL

---

## 🚀 部署方式二：Wrangler CLI 手动部署

### 安装 Wrangler

```bash
npm install -g wrangler
```

### 登录 Cloudflare

```bash
wrangler login
```

### 创建项目

```bash
cd /root/.openclaw/workspace/cinagroup-site
wrangler pages project create cinagroup-homepage \
  --production-branch main \
  --build-command "npm run build" \
  --build-output-directory dist
```

### 部署

```bash
# 部署到生产环境
wrangler pages deploy dist --project-name=cinagroup-homepage --branch main

# 或者使用 npm 脚本
npm run deploy:cloudflare
```

---

## 🤖 OpenClaw 自动化集成

### 配置 Cron 定时任务

在 OpenClaw 中配置自动内容更新：

```yaml
# 每天上午 9 点自动更新
- name: 每日内容更新
  schedule: "0 9 * * *"
  task: |
    1. 检查新闻源/数据源
    2. 生成 Markdown 文件到 src/content/post/
    3. git add src/content/post/*.md
    4. git commit -m "feat: add daily content update"
    5. git push origin main
```

### 示例：自动生成博客文章

**用户指令**："发布本周公司新闻"

**OpenClaw 执行流程**：

```bash
# 1. 创建博客文章
cat > src/content/post/weekly-news-2026-03-18.md << 'EOF'
---
title: 'CinaGroup 本周新闻 - 2026 年 3 月 18 日'
description: '本周公司重要动态和更新'
pubDate: '2026-03-18T09:00:00Z'
category: 'news'
tags: ['weekly', 'news', 'update']
author: 'CinaGroup Team'
image: '/_astro/news-weekly.jpg'
draft: false
---

## 本周亮点

### 1. 网站全新上线
我们很高兴宣布 CinaGroup 新网站正式上线...

### 2. 产品更新
本月我们推出了多项产品改进...

### 3. 团队扩展
欢迎新加入的团队成员...

---
*本文由 OpenClaw AI 自动生成*
EOF

# 2. 提交并推送
git add src/content/post/weekly-news-2026-03-18.md
git commit -m "feat: add weekly news 2026-03-18"
git push origin main

# 3. Cloudflare Pages 自动构建部署
# GitHub Actions 触发 → Cloudflare 构建 → 全球 CDN 分发
```

---

## 📊 项目配置详情

### 构建设置

| 配置项 | 值 |
|--------|-----|
| **Framework** | Astro 5.0 |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Node Version** | 20 |
| **Install Command** | `npm ci` |

### 环境变量（在 Cloudflare Dashboard 设置）

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NODE_VERSION` | `20` | Node.js 版本 |
| `SITE_NAME` | `CinaGroup` | 网站名称 |
| `SITE_URL` | `https://cinagroup.com` | 网站域名 |

---

## 🔧 本地开发测试

### 安装依赖

```bash
cd /root/.openclaw/workspace/cinagroup-site
npm install
```

### 启动开发服务器

```bash
# Astro 开发模式
npm run dev

# 或者使用 Wrangler 本地预览
wrangler pages dev dist
```

### 本地构建测试

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

---

## 📁 项目结构

```
cinagroup/homepage/
├── .github/
│   └── workflows/
│       └── cloudflare-deploy.yml    # GitHub Actions
├── src/
│   ├── components/                   # Astro 组件
│   │   ├── Logo.astro               # 自定义 Logo
│   │   └── widgets/
│   │       └── Announcement.astro   # 横幅（已移除）
│   ├── content/                      # Markdown 内容
│   │   └── post/                     # 博客文章
│   ├── layouts/                      # 页面布局
│   ├── pages/                        # 页面路由
│   │   ├── index.astro              # 首页
│   │   ├── about.astro              # 关于我们
│   │   ├── services.astro           # 服务
│   │   └── contact.astro            # 联系
│   └── config.yaml                   # 站点配置
├── public/
│   └── logo.png                      # 公司 Logo
├── cloudflare-pages.toml             # Cloudflare 配置
├── wrangler.toml                     # Wrangler CLI 配置
├── vercel.json                       # Vercel 备用配置
├── netlify.toml                      # Netlify 备用配置
└── package.json                      # 项目依赖
```

---

## 🎯 部署后检查清单

### 1. 验证部署

- [ ] 访问 https://cinagroup-homepage.pages.dev
- [ ] 检查 Logo 是否正确显示
- [ ] 测试所有页面链接
- [ ] 验证移动端响应式

### 2. 域名配置

- [ ] 添加自定义域名 `cinagroup.com`
- [ ] 配置 DNS 记录
- [ ] 验证 SSL 证书
- [ ] 设置 WWW 重定向

### 3. 性能优化

- [ ] 启用缓存
- [ ] 配置 CDN 规则
- [ ] 测试页面加载速度
- [ ] 优化图片大小

### 4. 监控设置

- [ ] 启用 Cloudflare Analytics
- [ ] 配置错误告警
- [ ] 设置正常运行时间监控
- [ ] 配置访问日志

---

## 🔒 安全配置

### 1. Token 管理

- ✅ GitHub Token 已配置
- ✅ Cloudflare API Token 已创建
- ⚠️ 定期更新 Token（建议每 90 天）
- ⚠️ 不要将 Token 提交到仓库

### 2. 访问控制

- [ ] 启用 GitHub 双因素认证
- [ ] 限制仓库访问权限
- [ ] 配置 Cloudflare 防火墙规则
- [ ] 启用 DDoS 防护

### 3. 安全头配置

已在 `cloudflare-pages.toml` 中配置：
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

---

## 📈 性能优化建议

### 图片优化

```bash
# 使用 Astro 内置图片优化
# 图片自动转换为 WebP 格式
# 响应式图片自动生成
```

### 缓存策略

- 静态资源：1 年缓存
- HTML 页面：不缓存
- API 响应：根据需求配置

### CDN 配置

Cloudflare 全球 275+ 数据中心自动分发

---

## 🐛 故障排查

### 构建失败

```bash
# 1. 本地测试构建
npm run build

# 2. 检查 Node 版本
node --version  # 应该是 v20

# 3. 清理依赖重新安装
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 部署未更新

1. 检查 GitHub Actions 日志
2. 验证 Git 推送是否成功
3. 检查 Cloudflare 构建日志
4. 清除 CDN 缓存

### 域名问题

1. 检查 DNS 传播：https://dnschecker.org
2. 验证 SSL 证书状态
3. 检查 Cloudflare DNS 设置

---

## 📞 常用链接

- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **Cloudflare Pages**: https://pages.cloudflare.com
- **GitHub 仓库**: https://github.com/cinagroup/homepage
- **Cloudflare 文档**: https://developers.cloudflare.com/pages/
- **Astro 文档**: https://docs.astro.build/

---

## 🎉 部署完成后的下一步

1. **配置域名** - 绑定 cinagroup.com
2. **设置监控** - 启用 Cloudflare Analytics
3. **配置邮箱** - 设置联系表单
4. **添加分析** - Google Analytics / Umami
5. **SEO 优化** - 提交 sitemap 到搜索引擎
6. **自动化** - 配置 OpenClaw 定时任务

---

**最后更新**: 2026-03-18  
**维护人员**: 001  
**仓库**: https://github.com/cinagroup/homepage  
**部署平台**: Cloudflare Pages
