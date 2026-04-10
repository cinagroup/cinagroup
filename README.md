# 🚀 CinaGroup 网站 - 快速开始指南

## ☁️ 部署平台：Cloudflare Pages

网站已部署到 Cloudflare Pages，享受全球 CDN 加速。

### 🌐 访问地址

- **生产环境**: https://cinagroup.com
- **预览环境**: https://cinagroup-homepage.pages.dev

---

## 📁 项目结构

```
cinagroup/homepage/
├── .github/workflows/       # GitHub Actions (自动部署)
├── src/
│   ├── components/          # Astro 组件
│   ├── content/             # Markdown 内容 (博客文章)
│   ├── layouts/             # 页面布局
│   ├── pages/               # 页面路由
│   └── config.yaml          # 站点配置
├── public/
│   └── logo.png             # 公司 Logo
├── cloudflare-pages.toml    # Cloudflare 配置
├── wrangler.toml            # Wrangler CLI 配置
└── package.json             # 项目依赖
```

---

## 🤖 自动化内容更新

### 通过 OpenClaw 自动发布

**示例指令：**

```
"添加一篇关于公司新产品的博客文章"
"更新关于我们页面的联系方式"
"发布 2026 年 3 月月度报告"
```

**自动执行流程：**

1. OpenClaw 生成 Markdown 文件
2. 自动 Git Commit + Push
3. GitHub Actions 触发构建
4. Cloudflare Pages 自动部署
5. 全球 CDN 分发 (2-5 分钟完成)

---

## 🛠️ 本地开发（可选）

```bash
# 克隆仓库
git clone https://github.com/cinagroup/homepage.git
cd homepage

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

---

## 📊 技术栈

- **框架**: Astro 5.0 + Tailwind CSS
- **部署**: Cloudflare Pages
- **CDN**: Cloudflare 全球 275+ 数据中心
- **自动化**: GitHub Actions + OpenClaw

---

## 🔗 重要链接

- **GitHub 仓库**: https://github.com/cinagroup/homepage
- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **完整部署文档**: `CLOUDFLARE-DEPLOYMENT.md`

---

**最后更新**: 2026-03-18  
**维护**: CinaGroup Team
