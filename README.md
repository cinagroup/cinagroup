# CinaGroup 官网

CinaGroup 官方网站，基于 [Astro](https://astro.build) 5 + [Tailwind CSS](https://tailwindcss.com) 构建。

## 🌐 访问地址

- **生产环境**: https://cinagroup.com
- **预览环境**: https://homepage.pages.dev

## 🏢 产品线

| 产品          | 描述                     |
| ------------- | ------------------------ |
| **CinaSeek**  | AI 驱动的企业搜索        |
| **CinaClaw**  | 24/7 AI 智能助手         |
| **CinaSkill** | 机器人技能创建与分享平台 |
| **CinaToken** | 统一 AI API 网关         |
| **CinaChain** | 高性能 Web3 基础设施     |

## 🚀 部署

通过 Cloudflare Pages 自动部署，push 到 main 分支后由 Cloudflare 连接的仓库构建发布。

```bash
# 本地开发
npm install
npm run dev
```

## 📁 项目结构

```
src/
├── components/    # Astro 组件
├── content/       # Markdown 内容
├── i18n.ts        # 多语言翻译（中英日韩西俄葡法）
├── layouts/       # 页面布局
├── pages/         # 页面路由
└── config.yaml    # 站点配置
```

## ⚠️ 待办

- [ ] 替换客户评价为真实数据
- [ ] 更新首页统计数据（活跃用户、API 调用量等）
- [ ] 配置 Google Analytics
- [ ] 替换 Hero 图片和头像
- [ ] 补充各产品子页面

---

维护: CinaGroup Team
