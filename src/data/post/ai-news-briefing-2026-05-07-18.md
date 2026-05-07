---
title: "AI News Briefing — May 7, 2026 (Evening)"
description: "Mira Murati video testimony reveals Altman undermined OpenAI execs, Google ships 3x-speed Gemma 4 drafters, Simon Willison warns vibe coding and agentic engineering are converging, Cloudflare lets AI agents go from zero to production autonomously, Reflex benchmark shows computer-use agents cost 45x more than structured APIs."
publishDate: 2026-05-07T10:00:00.000Z
author: "001"
tags:
  - AI News
  - OpenAI
  - Google
  - Gemma
  - Cloudflare
  - AI Agents
  - Vibe Coding
  - Meta
  - DeepMind
category: "AI News"
---

## 7 Top Stories

### 1. Mira Murati Deposition Video: "OpenAI Was at Catastrophic Risk of Falling Apart"
Video testimony from former OpenAI CTO Mira Murati was shown in the Musk v. Altman trial, revealing she believed OpenAI faced catastrophic risk of collapse after Altman's 2023 firing. Murati testified that Altman undermined her ability to do her job and pitted OpenAI executives against each other, saying he "told people what they wanted to hear" while dragging out decisions or avoiding controversial ones entirely. When Satya Nadella told the board Microsoft was "below them, above them, around them," Murati called it "terrifying" and said it signaled complete Microsoft control over OpenAI — the opposite of what the board had fought for. She also confirmed that Altman's problems persisted even after his return to the company.

### 2. Google Releases MTP Drafters for Gemma 4 — Up to 3x Faster Inference
Google announced Multi-Token Prediction (MTP) drafters for the Gemma 4 family, delivering up to a 3x speedup in inference without degrading output quality or reasoning. Using speculative decoding, the lightweight drafter model predicts several future tokens at once while the target model (Gemma 4 31B or 26B MoE) verifies them in parallel. The drafters share the target model's KV cache and activations, eliminating redundant computation. Google notes the approach unlocks "supercharged local development" — running 26B and 31B models on consumer GPUs with dramatically lower latency. MTP drafters are available now under Apache 2.0 on Hugging Face, Kaggle, and via Ollama, vLLM, SGLang, and MLX.

### 3. Simon Willison: Vibe Coding and Agentic Engineering Are Converging — and It's "Upsetting"
In a widely discussed essay (600+ upvotes on Hacker News), Simon Willison revealed that the distinction he drew between "vibe coding" (non-programmers asking AI for code without caring about quality) and "agentic engineering" (professionals using AI tools with deep technical oversight) is blurring in his own work. As coding agents become more reliable, Willison admits he's no longer reviewing every line of code they produce — treating them like semi-black-box internal services from other teams. He calls this "the normalization of deviance," noting that every time an agent writes correct code without close monitoring, it risks conditioning him to trust it at the wrong moment. He also argues the bottleneck has shifted: when you go from 200 to 2,000 lines of code per day, "the entire software development lifecycle" designed around slower output needs rethinking.

### 4. Cloudflare Lets AI Agents Go from Zero to Production Without Human Setup
Cloudflare announced that AI agents can now autonomously create Cloudflare accounts, start paid subscriptions, register domains, and deploy code — all in a single flow with no dashboard login or manual token entry. Built on a new protocol co-designed with Stripe as part of Stripe Projects, the system requires only a one-time human permission grant and terms-of-service acceptance. After that, agents provision everything needed to deploy a production application. The feature integrates with Cloudflare's Code Mode MCP server and Agent Skills, marking one of the first cases of a major cloud platform enabling fully autonomous agent-driven customer onboarding and deployment.

### 5. Benchmark: Computer-Use Vision Agents Cost 45x More Than Structured API Agents
Reflex published a benchmark comparing vision-based AI agents (driving a UI via screenshots and clicks) against agents calling structured APIs directly for the same admin panel task. The vision agent failed to complete the task autonomously — it couldn't paginate past visible content and missed three of four pending reviews. Even with a 14-step manual walkthrough added to the prompt, the vision agent took ~17 minutes and consumed ~550k input tokens, versus the API agent's 8 calls, 19.7 seconds, and ~12k tokens — a 45x cost difference. The study concludes that better vision models won't close this gap because the step count is set by the interface, not the model. "An agent that must see in order to act will always pay for the seeing."

### 6. Zuckerberg "Personally Authorized and Encouraged" Meta's Copyright Infringement, Lawsuit Alleges
Court documents in a copyright infringement lawsuit against Meta reveal that Mark Zuckerberg personally authorized and encouraged the company's use of copyrighted books for AI training, according to the complaint filed by authors including Scott Turow. The Variety report (475 upvotes on HN) cites evidence that leadership at the highest level directed the ingestion of protected works despite knowing the legal risks. This adds to mounting legal pressure on Meta's AI training practices, as publishers and authors increasingly challenge the "fair use" defense that Big Tech companies have relied on. The case could set precedent for how copyrighted creative works are treated in the era of large language model training.

### 7. Google DeepMind Invests in EVE Online Studio Fenris Creations
Google DeepMind has taken a minority investment — "in the millions" of dollars — in Fenris Creations, the newly independent studio behind EVE Online. The deal signals DeepMind's growing interest in applying AI to game development and interactive entertainment. EVE Online's complex player-driven economy and massive multiplayer simulations present unique opportunities for AI research, particularly in multi-agent systems and emergent behavior modeling. The investment follows a broader trend of AI labs looking at gaming environments as testbeds for next-generation AI capabilities, joining Microsoft's Minecraft initiatives and DeepMind's own work on StarCraft II.

---

## Trend Watch

| Domain | Trend | Signal |
|---|---|---|
| **AI Governance** | Murati testimony deepens OpenAI governance crisis narrative | 🔴 High |
| **Open Model Performance** | Google Gemma 4 gets 3x speedup via speculative decoding MTP | 🟢 Emerging |
| **AI Engineering Culture** | Willison identifies convergence of vibe coding and agentic engineering | 🟡 Growing |
| **Agent Infrastructure** | Cloudflare enables fully autonomous agent-to-production flow | 🟢 Emerging |
| **AI Cost Economics** | Vision agents proven 45x costlier than structured APIs for same tasks | 🟡 Growing |

---

## What to Watch

- **Musk v. Altman closing arguments** expected next Thursday — the trial continues to expose internal dynamics at OpenAI, from Murati's video testimony about Altman's management style to the systematic board failures revealed by Toner and Zilis. The verdict could reshape OpenAI's corporate structure and its $13 billion Microsoft relationship.
- **Structured APIs vs. computer-use for AI agents** — the Reflex benchmark adds hard data to an ongoing debate. As more companies (Cloudflare included) build agent-native infrastructure, expect a shift toward APIs and tool-use over vision-based approaches for cost-critical deployments.
- **Meta's copyright lawsuit escalation** — the allegation that Zuckerberg personally directed copyright infringement could move the needle on AI training data law, particularly if the court rejects Meta's fair use defense. The outcome will affect every major AI lab's training data strategy.
