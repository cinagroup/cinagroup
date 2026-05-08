---
title: "AI News Briefing — May 8, 2026: OpenAI Codex Goes Browser-Native, Mozilla Exposes 271 Claude-Found Firefox Bugs, and Snap Drops Perplexity"
description: "OpenAI launches a Codex Chrome extension for browser automation. Mozilla publicly discloses 271 Firefox vulnerabilities found by Claude Mythos Preview. Google personalizes Gmail AI drafting. Snap confirms its Perplexity AI search deal fell through. And the Musk v. Altman trial adds explosive new testimony."
publishDate: 2026-05-08T10:00:00.000Z
author: "001"
tags:
  - AI
  - OpenAI
  - Mozilla
  - Google
  - Snap
  - AI Security
  - AI Agents
  - Musk v Altman
category: "ai-news"
---

## 7 Top Stories

### 1. OpenAI Launches Codex Chrome Extension — Codex Can Now Control Your Browser

OpenAI released a **Codex extension for Chrome** listed on the Chrome Web Store, allowing Codex to interact with websites and apps where users are already signed in. The extension operates in "task-specific" tab groups so users can continue using their active tabs while Codex works in isolated ones. This marks a significant shift from Codex as a code-only tool to a general-purpose agent that can navigate the open web — filling forms, scraping data, and completing workflows inside authenticated sessions. The extension requires the Codex Chrome plugin to function and signals OpenAI's push toward browser-native agentic AI. ([The Verge](https://www.theverge.com/ai-artificial-intelligence))

### 2. Mozilla Publicly Discloses 271 Firefox Bugs Found by Claude Mythos Preview

Mozilla took the unusual step of **publicly releasing detailed bug reports** for 271 Firefox security vulnerabilities discovered by Anthropic's **Claude Mythos Preview** AI model. Normally, Mozilla keeps bug reports private for months after shipping fixes to protect users who haven't updated. "Given the extraordinary level of interest in this topic and the urgency of action needed throughout the software ecosystem, we've made the calculated decision to unhide a small sample of the reports," Mozilla said. The disclosures, published alongside Firefox 150.0.2 security advisories on May 7, highlight the growing role of AI models in vulnerability research and underscore the pressure on browser vendors to respond to AI-accelerated security findings at scale. ([The Verge](https://www.theverge.com/ai-artificial-intelligence), [Mozilla MFSA 2026-40](https://www.mozilla.org/en-US/security/advisories/mfsa2026-40/))

### 3. Google Personalizes Gmail AI Drafting With Your Voice and Workspace Context

Google is rolling out **two major upgrades** to Gmail's "Help me write" AI tool: **tone and style personalization** that matches drafts to your previous writing patterns, and **topic contextualization** that pulls relevant information from Google Drive and Gmail based on your prompt. The feature can now automatically insert correct details from your Workspace apps into email drafts, reducing cross-app context switching. Rollout began May 5 for Business Starter through Enterprise Plus, and Google AI Plus/Ultra consumer tiers. The move positions Gmail's AI as a context-aware drafting assistant rather than a generic text generator. ([Google Workspace Blog](https://workspaceupdates.googleblog.com/2026/05/improvements-to-help-me-write-in-gmail.html))

### 4. Snap Confirms Perplexity Partnership Dissolved — AI Search Deal Fell Through

In its Q1 2026 investor letter, **Snap confirmed** that its much-announced partnership with **Perplexity AI** has ended "amicably" — and warned analysts not to expect any revenue contribution from the deal. The partnership, originally announced as a plan to power AI search inside Snapchat, never materialized. Snap also hinted at "intelligent eyewear" news coming in June, suggesting its hardware AI strategy is shifting toward Specs rather than search integration. The dissolution raises questions about whether Perplexity's B2B licensing model is sustainable as more platforms build their own AI capabilities in-house. ([The Verge](https://www.theverge.com/ai-artificial-intelligence))

### 5. DeepSeek 4 Flash Local Inference Engine for Apple Silicon Gains Traction

A new **local inference engine for DeepSeek 4 Flash** optimized for Apple's Metal GPU framework appeared on Hacker News and quickly rose to 390 points. The project enables running DeepSeek 4 Flash entirely locally on Mac hardware without cloud API calls, tapping into growing demand for private, offline AI inference. The timing is notable: as Chrome quietly removes claims that on-device AI doesn't send data to Google servers, the open-source community is racing to build genuinely local alternatives. The Metal optimization represents a significant step toward making capable models runnable on consumer hardware. ([Hacker News](https://news.ycombinator.com/))

### 6. Musk v. Altman Trial: New Testimony on AGI Safety, OpenAI's Anthropic Merger Plans, and Nonprofit Governance

The trial added **three new witness depositions** that expanded the scope of the governance dispute:

- **Rosie Campbell**, a former OpenAI employee who moved from applied work to "AGI readiness" teams, testified about the dissolution of OpenAI's safety-focused teams in 2024 — though cross-examination questioned the validity of AGI safety concerns if superintelligence isn't achievable.
- **David Schizer**, a Columbia Law professor specializing in nonprofit governance, testified as Musk's expert witness on nonprofit fiduciary obligations.
- **Helen Toner** continued her deposition, confirming the board discussed **merging OpenAI with Anthropic** during "the Blip" and considered **Dario Amodei as potential CEO**. She also described AI model training as "more like alchemy than chemistry," noting there's no clear-cut way to test for safety.

The trial is expected to reach closing arguments within a week. ([The Verge](https://www.theverge.com/ai-artificial-intelligence))

### 7. AI Agent Architecture Debate: "Agents Need Control Flow, Not More Prompts"

A highly-discussed post on Hacker News (470 points) argues that the AI agent field is stuck in a **prompt-centric paradigm** that fundamentally limits reliability. The author contends that agents need structured control flow — conditionals, loops, error handling, and state machines — rather than increasingly elaborate prompt engineering. The argument resonates with broader industry trends: Simon Willison's parallel HN piece on "vibe coding and agentic engineering" (764 points) notes that AI-assisted coding is getting closer to production-ready tooling faster than expected, but the control flow problem remains unsolved. Together, these discussions signal a maturing conversation about what AI agents actually need to be reliable. ([Hacker News](https://news.ycombinator.com/))

## Trend Watch

| Domain | Trend | Signal |
|---|---|---|
| **Browser-Native AI Agents** | OpenAI's Codex Chrome extension marks the shift from code-only AI to agents that operate inside authenticated web sessions | 🔴 Hot |
| **AI-Driven Security Research** | Mozilla's unprecedented public disclosure of 271 Claude-found Firefox bugs signals AI vulnerability discovery is outpacing patch cycles | 🔴 Hot |
| **Context-Aware AI Assistants** | Google's Gmail AI now matches your writing style and pulls cross-app context — personalization becomes the differentiator | 🟡 Watching |
| **AI B2B Partnerships Under Pressure** | Snap-Perplexity dissolution shows platforms are reconsidering third-party AI licensing as in-house capabilities improve | 🟡 Watching |
| **Local AI Inference Momentum** | DeepSeek 4 Flash on Metal + Chrome removing on-device privacy claims = growing demand for genuinely local, private AI | 🔴 Hot |

## What to Watch

- **Musk v. Altman closing arguments (next week)** — With closing arguments expected within days, the jury's verdict could set precedent for governance of nonprofit-originated AI labs and clarify whether donor conditions on massive gifts (Musk's $100M+) are legally enforceable.
- **Mozilla's broader security disclosure strategy** — If more companies follow Mozilla's lead in publicly releasing AI-discovered vulnerabilities, the software ecosystem could see accelerated security improvements — or a flood of zero-day information that bad actors exploit.
- **AI agent control flow frameworks** — The industry conversation is shifting from "how do we prompt agents better?" to "how do we give agents reliable execution semantics?" Expect new frameworks and libraries addressing this gap to emerge in the coming months.
