# 🚀 CinaGroup 网站自动化部署指南

## 📋 部署架构

```
OpenClaw (本地 AI) → GitHub 仓库 → Vercel/Netlify → 全球 CDN
```

---

## ✅ 已完成配置

| 项目 | 状态 |
|------|------|
| **GitHub 仓库** | ✅ https://github.com/cinagroup/homepage |
| **初始提交** | ✅ 已推送所有代码 |
| **Vercel 配置** | ✅ vercel.json |
| **Netlify 配置** | ✅ netlify.toml |
| **Docker 本地部署** | ✅ 运行中 (101.32.108.223:8080) |

---

## 🎯 方案一：Vercel 部署（推荐）

### 步骤

1. **访问 Vercel**
   - 打开 https://vercel.com
   - 使用 GitHub 账号登录

2. **导入项目**
   - 点击 "Add New Project"
   - 选择 `cinagroup/homepage` 仓库
   - 点击 "Import"

3. **配置构建设置**
   - Framework Preset: **Astro**
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. **点击 "Deploy"**

5. **配置域名**
   - 部署完成后，进入项目设置
   - Domains → Add Domain
   - 输入 `cinagroup.com` 和 `www.cinagroup.com`
   - 按提示配置 DNS

### 优势
- ✅ 自动 HTTPS
- ✅ 全球 CDN
- ✅ 零配置部署
- ✅ 自动预览部署

---

## 🎯 方案二：Netlify 部署

### 步骤

1. **访问 Netlify**
   - 打开 https://netlify.com
   - 使用 GitHub 账号登录

2. **添加站点**
   - "Add new site" → "Import an existing project"
   - 选择 GitHub
   - 选择 `cinagroup/homepage` 仓库

3. **配置构建**
   - Build command: `npm run build`
   - Publish directory: `dist`

4. **点击 "Deploy site"**

5. **配置域名**
   - Site settings → Domain management
   - Add custom domain: `cinagroup.com`

---

## 🎯 方案三：Cloudflare Pages

### 步骤

1. **登录 Cloudflare**
   - https://pages.cloudflare.com

2. **创建项目**
   - "Create a project" → "Connect to Git"
   - 选择 `cinagroup/homepage`

3. **配置构建**
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`

4. **保存并部署**

---

## 🎯 方案四：GitHub Pages

### 步骤

1. **启用 GitHub Pages**
   - 仓库 Settings → Pages
   - Source: GitHub Actions

2. **添加工作流文件**
   - 创建 `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## 🤖 OpenClaw 自动化工作流

### 1. 内容生成流程

```
用户指令 → OpenClaw → 生成 Markdown → Git Commit → Git Push → 云平台自动部署
```

### 2. 示例：添加博客文章

**用户指令**: "添加一篇关于公司新产品的博客文章"

**OpenClaw 执行**:
```bash
# 1. 创建 Markdown 文件
cat > src/content/post/new-product-launch.md << EOF
---
title: 'CinaGroup 新产品发布'
description: '介绍我们的最新产品'
pubDate: '2026-03-18'
category: 'news'
tags: ['product', 'launch']
image: '/_astro/product.jpg'
---

文章内容...
EOF

# 2. 提交并推送
git add src/content/post/new-product-launch.md
git commit -m "feat: add new product launch blog post"
git push origin main
```

**云平台自动**:
- 检测到新提交
- 自动执行 `npm run build`
- 部署新版本
- 网站更新完成

### 3. Cron 定时任务

在 OpenClaw 配置定时任务：

```yaml
# 每天上午 9 点检查更新
- name: 每日内容更新
  schedule: "0 9 * * *"
  task: |
    1. 检查新闻源
    2. 生成博客文章
    3. 推送到 GitHub
```

---

## 📝 内容目录结构

```
src/content/
├── post/           # 博客文章
│   ├── article-1.md
│   └── article-2.md
├── pages/          # 页面内容
│   ├── about.md
│   └── services.md
└── config/         # 配置文件
    └── site.yaml
```

---

## 🔧 常用 Git 命令

```bash
# 查看状态
git status

# 添加更改
git add -A

# 提交
git commit -m "描述"

# 推送
git push origin main

# 拉取最新
git pull origin main

# 查看历史
git log --oneline
```

---

## 🎨 品牌元素位置

| 元素 | 文件路径 |
|------|---------|
| **Logo** | `public/logo.png` |
| **网站配置** | `src/config.yaml` |
| **Logo 组件** | `src/components/Logo.astro` |
| **首页** | `src/pages/index.astro` |
| **关于我们** | `src/pages/about.astro` |
| **服务** | `src/pages/services.astro` |
| **联系** | `src/pages/contact.astro` |

---

## 📊 部署状态检查

### Vercel
- 仪表板：https://vercel.com/dashboard
- 部署日志：项目 → Deployments

### Netlify
- 仪表板：https://app.netlify.com/sites
- 部署日志：项目 → Deploys

### 本地 Docker
```bash
# 查看容器状态
docker ps | grep astrowind

# 查看日志
docker logs astrowind
```

---

## 🔒 安全建议

1. **Token 管理**
   - ✅ 已使用 GitHub Token 推送
   - ⚠️ 不要将 Token 提交到仓库
   - ✅ 使用环境变量存储敏感信息

2. **访问控制**
   - 限制仓库访问权限
   - 启用双因素认证
   - 定期更新 Token

---

## 📞 故障排查

### 构建失败
```bash
# 本地测试构建
npm run build

# 查看错误日志
cat dist/index.html
```

### 部署未更新
1. 检查 Git 推送是否成功
2. 查看云平台构建日志
3. 清除 CDN 缓存

### 域名问题
1. 检查 DNS 解析
2. 验证 SSL 证书
3. 检查域名配置

---

**最后更新**: 2026-03-18  
**维护人员**: 001  
**仓库**: https://github.com/cinagroup/homepage
