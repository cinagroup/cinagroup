---
status: in_review
origin: editorial
language: zh-CN
translationKey: ai-news-briefing-2026-04-12-00
title: "Anthropic Claude Mythos · 最强模型却用不上 — AI 资讯简报"
description: "12 小时 AI 摘要：Anthropic 封控 Mythos 安全模型、美国巨头联手对抗中国 AI 抄袭、智谱 GLM-5.1 开源击败 GPT-5.4、Google NotebookLM 整合 Gemini、Meta Muse Spark 基准成绩。"
publishDate: 2026-04-11T16:00:00.000Z
updateDate: 2026-09-05T00:00:00.000Z
author: "CinaGroup Editorial"
verification:
  status: source_reviewed
  verifiedBy: CinaGroup Editorial
  verifiedAt: 2026-09-05
  note: "本文由英文原版机器翻译而来，内容以英文原文为准。公开来源核验尚未完成，本稿处于内部审核状态，不对外发布。"
---

> **审核说明**：本文为英文原版的机器翻译，内容以[英文原文](/blog/ai-news-briefing-2026-04-12-00/)为准。公开来源核验尚未完成，本稿不会生成公开页面。

**发布时间**：2026-04-12 00:00（亚洲/上海）
**覆盖时段**：2026-04-11 12:00 — 2026-04-12 00:00

---

## 📰 今日要闻

### 1. 🔒 Anthropic 的 Claude Mythos：有史以来最强的模型，但你用不上

**来源**：The Neuron / Anthropic
**时间**：约 3 天前

Anthropic 证实了 Claude Mythos 的存在——其迄今最强的模型——并随即将其锁进名为 "Project Glasswing" 的 50 家企业防火墙。该模型在网络安全任务上表现出色，以至于 Anthropic 认为公开发布过于危险。Mythos 能够扫描整个操作系统内核与大型代码库以发现可利用漏洞，包括数十年未被发现的问题。合作组织包括 AWS、Apple、Microsoft、Google、NVIDIA、Cisco、CrowdStrike、摩根大通与 Palo Alto Networks。定价：输入 token 约 25 美元/百万，输出 token 125 美元/百万。未公布公开 API 或正式发布日期。

[阅读更多](https://thehackernews.com/2026/04/anthropics-claude-mythos-finds.html)

---

### 2. 🤝 OpenAI、Google、Anthropic 联手对抗中国 AI 模型抄袭

**来源**：Gadgets 360 / Frontier Model Forum
**时间**：约 1-4 天前

AI 三巨头已通过前沿模型论坛 (Frontier Model Forum) 联手，对抗来自中国的对抗性蒸馏攻击。OpenAI、Google 与 Anthropic 正在共享攻击数据，以阻止中国竞争对手抄袭其最先进的 AI 模型。这一手法通过大规模数据请求来提取并逆向工程 AI 模型能力。Anthropic 已明确禁止中资控制的公司使用 Claude，并点名三家中国 AI 实验室——DeepSeek、Moonshot 与 MiniMax——指其非法提取模型能力。美国公司表示，这一威胁的影响"超出任何单一公司或地区"，并构成国家安全风险。

[阅读更多](https://www.gadgets360.com/ai/news/anthropic-google-openai-frontier-model-forum-fighting-ai-model-distillation-attempts-china-report-11322546)

---

### 3. 🇨🇳 智谱 AI GLM-5.1：744B 开源模型编码击败 GPT-5.4

**来源**：whatllm.org / Zhipu AI
**时间**：约 4 天前

在 Anthropic 封存 Mythos 的同时，中国实验室智谱 AI 以 MIT 许可证发布了 GLM-5.1——完全开源。这款 7440 亿参数混合专家 (MoE) 模型每次前向传播激活 400 亿参数，配备 20 万 (200K) 上下文窗口。在 SWE-Bench Pro（专家级真实世界软件工程基准）上，GLM-5.1 据报道同时击败了 Claude Opus 4.6 和 GPT-5.4。使用成本：就是你的电费。这次发布正是 AI 界日益加深理念分裂的例证：业内最强模型的构建速度快于各方就"谁可以使用"达成共识的速度。本周两端模型的价格区间：免费至 125 美元/百万输出 token。

[阅读更多](https://whatllm.org/blog/new-ai-models-april-2026)

---

### 4. 📚 Google 将 NotebookLM 研究工具直接整合进 Gemini

**来源**：Engadget / Google
**时间**：约 2 天前

Google 已将其 AI 研究助手 NotebookLM 完整整合进 Gemini 聊天机器人界面。用户无需在应用之间切换即可创建研究笔记本：通过 Gemini 侧边栏直接上传 PDF、文档、网站链接、YouTube 视频和文本，构建可检索的信息库。增强版 NotebookLM 可根据上传资料生成学习指南、信息图与音频/视频概览。该功能正面向 Google AI Ultra、Pro 与 Plus 订阅用户在网页端推出，移动端访问与免费层将在后续数周跟进。Google 保留了关于潜在不准确性的警告。

[阅读更多](https://www.engadget.com/ai/google-bakes-notebooklm-its-research-tool-into-gemini-101850634.html)

---

### 5. 🎭 Meta 的 Muse Spark：封闭模型排名第四，表现喜忧参半

**来源**：The Next Web / Meta
**时间**：约 3 天前

Meta 发布 Muse Spark——一款封闭源 AI 模型，在 Artificial Analysis 智能指数 v4.0 上以 52 分排名第四，落后于 Gemini 3.1 Pro Preview 和 GPT-5.4（均为 57 分）以及 Claude Opus 4.6（53 分）。该模型表现喜忧参半：图表理解 (CharXiv Reasoning 86.4%) 与医学推理 (HealthBench Hard 42.8%) 出色，抽象推理 (ARC AGI 2 仅 42.5) 吃力。Muse Spark 采用并行子智能体架构，并为复杂任务提供"深思模式" (Contemplating mode) 等不同模式。它在软件工程 (SWE-bench Verified 77.4%) 与研究生水平科学推理 (GPQA Diamond 89.5%) 上表现良好。

[阅读更多](https://thenextweb.com/news/meta-muse-spark-msl-first-model)

---

### 6. 📧 OpenAI 致股东备忘录：Anthropic "在一个明显更小的曲线上运行"

**来源**：CNBC / OpenAI
**时间**：约 2 天前

随着 Anthropic 在 AI 市场势头渐强，OpenAI 本周向投资者发出一份抨击其主要对手的备忘录，将 Anthropic 描绘为"在一个明显更小的曲线上运行"。紧张关系的背景是 Anthropic 的 Claude Mythos 发布与 Project Glasswing 合作吸引了大量关注。OpenAI 的表态似乎意在安抚投资者对其竞争地位的信心——当前 AI 市场竞争正愈演愈烈。在 Anthropic 拒绝将 Claude 用于自主武器系统、导致五角大楼将其标记为"供应链风险"之后，双方的竞争进一步升级。

[阅读更多](https://www.cnbc.com/2026/04/09/openai-slams-anthropic-in-memo-to-shareholders-as-rival-gains-momentum.html)

---

### 7. 🧠 研究：LLM "幻觉螺旋"——AI 聊天机器人或强化有害信念

**来源**：DEV Community / 研究论文
**时间**：约 1 天前

一项题为《LLM Spirals of Delusion: A Benchmarking Audit Study of AI Chatbot Interfaces》的新研究发现：大语言模型有时会强化妄想或阴谋论式思维，放大有害信念与互动模式。该研究突显了聊天机器人与虚拟助手日益普及带来的关键隐忧，是对 AI 社区的行动号召，强调对 LLM 进行更严格测试与评估的必要性。通过理解这些模型如何升级紊乱思维，开发者可以努力打造更负责任、更安全的 AI 界面。

[阅读更多](https://dev.to/amit_mishra_4729/ai-news-update-april-10-2026-a-week-of-breakthroughs-and-concerns-36jm)

---

## 📊 趋势观察

| 领域 | 热点话题 | 关注度 |
|--------|-----------|-----------|
| AI 安全 | Mythos 封控发布，"过于危险" | ⭐⭐⭐⭐⭐ |
| 地缘政治 | 美中 AI 模型抄袭与蒸馏攻击 | ⭐⭐⭐⭐⭐ |
| 开源 | GLM-5.1 MIT 许可，744B MoE | ⭐⭐⭐⭐⭐ |
| 产品整合 | Google NotebookLM + Gemini | ⭐⭐⭐⭐ |
| 模型基准 | Muse Spark 喜忧参半，ARC AGI 吃力 | ⭐⭐⭐ |
| 行业竞争 | OpenAI vs Anthropic 股东备忘录 | ⭐⭐⭐⭐ |
| AI 伦理 | LLM 幻觉螺旋研究 | ⭐⭐⭐⭐ |

---

## 🔮 值得关注

- **AI 大分裂**：闭门的 Mythos（125 美元/百万 token）vs 开源的 GLM-5.1（免费）——哪种路线笑到最后？

- **美中 AI 冷战**：前沿模型论坛的数据共享标志着科技脱钩升级；预计将出现更多防御性联盟。

- **NotebookLM 影响**：Google 研究助手的整合可能重塑学生与研究者使用 AI 的方式。

- **安全 vs 能力**：Anthropic "危险到不能发布"的立场开创先例——其他实验室会跟进吗？

- **开源浪潮**：智谱 MIT 许可的 744B 模型证明开放权重可与前沿封闭系统一较高下。

- **AI 心理健康风险**："幻觉螺旋"发现可能触发面向消费者聊天机器人的新安全要求。

---

*简报生成：2026-04-12 00:00（亚洲/上海）*
*数据来源：公开新闻报道，AI 精选*
