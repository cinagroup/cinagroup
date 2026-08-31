# CinaGroup 官网

CinaGroup 官方网站，基于 [Astro](https://astro.build) 5 + [Tailwind CSS](https://tailwindcss.com) 构建。

## 🌐 访问地址

- **生产环境**: https://cinagroup.com
- **Cloudflare Pages**: https://homepage-cj7.pages.dev

## 🏢 产品线

| 产品          | 当前可验证的公开范围                   |
| ------------- | -------------------------------------- |
| **CinaSeek**  | 早期访问的智能体工作区与隔离式小应用   |
| **CinaClaw**  | 开源、本地优先的 Gateway、CLI 与工作区 |
| **CinaSkill** | CinaClaw 使用的 `SKILL.md` 能力格式    |
| **CinaToken** | 开源、可自托管的统一模型网关           |
| **CinaChain** | Base Sepolia 测试网 NFT DApp（Beta）   |

## 🚀 部署

唯一受支持的生产部署链是 [GitHub Actions](./.github/workflows/deploy.yml)：PR 只执行检查，只有 push 到
`main` 才会在所有检查、测试、构建和审计通过后发布到 Cloudflare Pages 项目 `cinagroup`。Cloudflare
Dashboard 的 Pages Git Integration 必须保持断开，否则同一个 commit 会触发重复部署。完整运维说明见
[docs/deployment.md](./docs/deployment.md)。

```bash
# 本地开发
npm ci
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

## 🔎 公开证据

[`/work/`](https://cinagroup.com/work/) 说明公开证据的分层和案例发布标准。当前没有获准公开的客户案例；
网站不会用虚构客户、第三方 logo、匿名评价或缺少方法说明的指标代替真实证据。

---

维护: CinaGroup Team
