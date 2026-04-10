# 🚀 CinaGroup 网站重构规划

## 📋 项目概述

**目标**: 基于现有 Astro 5.0 + Tailwind CSS 模板，重构 cinagroup.com 官网，突出四大核心业务线

**域名**: https://cinagroup.com  
**技术栈**: Astro 5.0 + Tailwind CSS + Cloudflare Pages  
**部署**: 自动化 CI/CD (GitHub Actions)

---

## 🎯 四大核心业务

| 业务 | 产品名称 | 定位 | 目标用户 |
|------|----------|------|----------|
| **智能服务** | CinaSeek | AI 驱动的智能搜索与信息服务 | 企业、开发者、研究人员 |
| **智能机器人** | CinaClaw | 多功能 AI 助手与自动化机器人 | 个人用户、企业客服、运营团队 |
| **机器人技能** | CinaSkill | 可扩展的机器人技能商店与开发平台 | 开发者、技能创作者 |
| **区块链** | CinaChain | 去中心化区块链基础设施与应用 | 开发者、Web3 项目、企业 |

---

## 🏗️ 网站架构

```
cinagroup.com/
├── / (首页)                    # 集团形象 + 四大业务入口
├── /about                      # 关于我们
├── /contact                    # 联系我们
├── /blog                       # 博客/新闻
│
├── /cinaseek/                  # 智能服务
│   ├── index                   # 产品首页
│   ├── features                # 功能特性
│   ├── pricing                 # 价格方案
│   ├── docs                    # 文档
│   └── api                     # API 参考
│
├── /cinaclaw/                  # 智能机器人
│   ├── index                   # 产品首页
│   ├── features                # 功能特性
│   ├── use-cases               # 应用场景
│   ├── pricing                 # 价格方案
│   └── demo                    # 在线演示
│
├── /cinaskill/                 # 机器人技能
│   ├── index                   # 技能商店首页
│   ├── marketplace             # 技能市场
│   ├── create                  # 创建技能
│   ├── docs                    # 开发文档
│   └── submit                  # 提交技能
│
└── /cinachain/                 # 区块链
    ├── index                   # 产品首页
    ├── network                 # 网络状态
    ├── explorer                # 区块浏览器
    ├── developers              # 开发者资源
    └── ecosystem               # 生态系统
```

---

## 📄 页面规划

### 1️⃣ 首页 (/)

**目标**: 展示集团形象，引导用户到各业务线

**模块结构**:
```
┌─────────────────────────────────────┐
│  Header (导航 + Logo)               │
├─────────────────────────────────────┤
│  Hero Section                       │
│  - 集团 Slogan                      │
│  - CTA 按钮                         │
├─────────────────────────────────────┤
│  Business Overview (四大业务卡片)    │
│  - CinaSeek 智能服务                │
│  - CinaClaw 智能机器人              │
│  - CinaSkill 技能平台               │
│  - CinaChain 区块链                 │
├─────────────────────────────────────┤
│  Features Highlight                 │
│  - 技术优势                         │
│  - 核心能力                         │
├─────────────────────────────────────┤
│  Stats                              │
│  - 用户数、API 调用量、技能数量等     │
├─────────────────────────────────────┤
│  Testimonials                       │
│  - 客户评价                         │
├─────────────────────────────────────┤
│  Call to Action                     │
│  - 联系我们/开始使用                 │
├─────────────────────────────────────┤
│  Footer                             │
└─────────────────────────────────────┘
```

### 2️⃣ 业务页面通用结构

每个业务线页面包含:
- **Hero Section**: 产品名称 + 核心价值主张
- **Features**: 功能特性展示 (3-6 个)
- **How It Works**: 工作原理/流程图
- **Use Cases**: 应用场景
- **Pricing**: 价格方案 (如适用)
- **Testimonials**: 用户评价
- **CTA**: 行动号召

---

## 🎨 设计规范

### 颜色方案

```yaml
primary:
  - name: CinaBlue
    hex: '#2563EB'
    usage: 主品牌色，按钮，链接
  
  - name: CinaPurple
    hex: '#7C3AED'
    usage: CinaChain 区块链主题色
  
  - name: CinaGreen
    hex: '#10B981'
    usage: CinaSeek 智能服务主题色
  
  - name: CinaOrange
    hex: '#F59E0B'
    usage: CinaClaw 智能机器人主题色
  
  - name: CinaPink
    hex: '#EC4899'
    usage: CinaSkill 技能平台主题色

neutral:
  - name: Slate
    range: '50-900'
    usage: 文字，背景，边框
```

### 字体

```yaml
heading: 'Inter, system-ui, sans-serif'
body: 'Inter, system-ui, sans-serif'
mono: 'Fira Code, monospace'  # 代码块
```

### 图标

- **主要图标库**: Tabler Icons (`tabler:*`)
- **备用图标库**: Flat Color Icons (`flat-color-icons:*`)
- **业务图标**:
  - CinaSeek: `tabler:search`
  - CinaClaw: `tabler:robot`
  - CinaSkill: `tabler:code`
  - CinaChain: `tabler:link`

---

## 📝 内容策略

### 首页文案

**Hero Section**:
```
标题：CinaGroup — Building the Future of AI & Web3
副标题：We provide cutting-edge solutions in AI search, intelligent robots, 
       skill platforms, and blockchain infrastructure.
CTA: [Explore Our Products] [Contact Us]
```

**四大业务卡片**:

| 业务 | 标题 | 描述 | CTA |
|------|------|------|-----|
| CinaSeek | 智能搜索服务 | AI 驱动的企业级搜索解决方案，让信息触手可及 | [了解更多] |
| CinaClaw | 智能机器人 | 7x24 小时 AI 助手，自动化您的工作流程 | [试用演示] |
| CinaSkill | 技能平台 | 创建、分享、发现机器人技能，无限扩展可能 | [浏览技能] |
| CinaChain | 区块链网络 | 高性能、低成本的 Web3 基础设施 | [查看网络] |

### 各业务线核心信息

#### CinaSeek (智能服务)
- **定位**: AI 驱动的智能搜索与信息服务平台
- **核心功能**:
  - 多源数据聚合搜索
  - 自然语言理解
  - 智能排序与推荐
  - 企业知识库集成
- **目标用户**: 企业、研究机构、开发者
- **价格模式**: Freemium + 企业定制

#### CinaClaw (智能机器人)
- **定位**: 多功能 AI 助手与自动化机器人
- **核心功能**:
  - 多平台集成 (QQ/微信/Telegram/Discord)
  - 自然语言对话
  - 任务自动化
  - 定时提醒与监控
- **目标用户**: 个人用户、客服团队、运营人员
- **价格模式**: 免费 + Pro 订阅

#### CinaSkill (机器人技能)
- **定位**: 可扩展的机器人技能开发平台
- **核心功能**:
  - 技能开发框架
  - 技能商店
  - 版本管理
  - 收益分成
- **目标用户**: 开发者、技能创作者
- **价格模式**: 免费发布 + 交易抽成

#### CinaChain (区块链)
- **定位**: 高性能去中心化区块链基础设施
- **核心功能**:
  - 智能合约
  - DeFi 协议
  - NFT 市场
  - 跨链桥接
- **目标用户**: Web3 开发者、项目方、企业
- **价格模式**: Gas 费 + 生态基金

---

## 🔧 技术实现

### 新增组件

```
src/components/business/
├── BusinessCard.astro      # 业务卡片组件
├── ProductHero.astro       # 产品 Hero 组件
├── FeatureGrid.astro       # 功能网格
├── PricingTable.astro      # 价格表
├── UseCaseShowcase.astro   # 用例展示
├── StatsCounter.astro      # 数据计数器
└── TechStack.astro         # 技术栈展示
```

### 新增页面

```bash
# 创建业务线页面
src/pages/cinaseek/index.astro
src/pages/cinaclaw/index.astro
src/pages/cinaskill/index.astro
src/pages/cinachain/index.astro

# 创建子页面
src/pages/cinaseek/pricing.astro
src/pages/cinaclaw/demo.astro
src/pages/cinaskill/marketplace.astro
src/pages/cinachain/explorer.astro
```

### 配置文件更新

```yaml
# src/config.yaml
site:
  name: CinaGroup
  description: "CinaGroup - AI & Web3 Solutions"

# 新增业务线配置
business:
  cinaseek:
    name: CinaSeek
    tagline: 智能搜索服务
    color: '#10B981'
    icon: 'tabler:search'
    
  cinaclaw:
    name: CinaClaw
    tagline: 智能机器人
    color: '#F59E0B'
    icon: 'tabler:robot'
    
  cinaskill:
    name: CinaSkill
    tagline: 技能平台
    color: '#EC4899'
    icon: 'tabler:code'
    
  cinachain:
    name: CinaChain
    tagline: 区块链网络
    color: '#7C3AED'
    icon: 'tabler:link'
```

---

## 📅 实施计划

### Phase 1: 基础架构 (Week 1)
- [ ] 创建业务线配置
- [ ] 设计通用组件 (BusinessCard, ProductHero 等)
- [ ] 更新首页布局
- [ ] 创建导航结构

### Phase 2: 业务页面 (Week 2-3)
- [ ] CinaSeek 页面
- [ ] CinaClaw 页面
- [ ] CinaSkill 页面
- [ ] CinaChain 页面

### Phase 3: 内容填充 (Week 4)
- [ ] 编写产品文案
- [ ] 准备图片资源
- [ ] 配置 SEO 元数据
- [ ] 添加博客文章

### Phase 4: 测试与优化 (Week 5)
- [ ] 响应式测试
- [ ] 性能优化
- [ ] SEO 优化
- [ ] 无障碍测试

### Phase 5: 上线部署 (Week 6)
- [ ] 生产环境构建
- [ ] 域名配置
- [ ] SSL 证书
- [ ] 监控与分析

---

## 📊 成功指标

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 页面加载速度 | < 2s | Lighthouse |
| SEO 评分 | > 90 | Lighthouse SEO |
| 移动端适配 | 100% 响应式 | 多设备测试 |
| 可访问性 | WCAG 2.1 AA | axe DevTools |
| 转化率 | > 5% | Google Analytics |

---

## 🔗 相关资源

- **设计参考**: 
  - https://vercel.com
  - https://stripe.com
  - https://openai.com
  
- **技术文档**:
  - Astro Docs: https://docs.astro.build
  - Tailwind CSS: https://tailwindcss.com
  - Cloudflare Pages: https://pages.cloudflare.com

- **竞品分析**:
  - 搜索服务：Perplexity, You.com
  - AI 机器人：Replika, Character.ai
  - 技能平台：Zapier, IFTTT
  - 区块链：Polygon, Solana

---

**创建时间**: 2026-03-20  
**版本**: v1.0  
**维护**: CinaGroup Team
