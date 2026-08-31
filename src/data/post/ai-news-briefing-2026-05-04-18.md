---
status: archived_unverified
origin: automated_news_workflow
verification:
  status: unverified
  note: "Preserved from a retired automated workflow; claims were not independently source-checked."
title: "AI News Briefing — May 4, 2026 (PM): VS Code's Controversial Copilot Default, Chinese Models Top Coding Benchmarks, and California Tickets Driverless Cars"
description: "Microsoft enables 'Co-Authored-by Copilot' in VS Code by default, sparking developer backlash; Kimi K2.6 and MiMo V2-Pro beat Western models in AI coding contest; California DMV announces first-in-nation rules to ticket autonomous vehicles; AI hiring tools show 67–82% self-preference bias against human resumes."
publishDate: 2026-05-04T10:00:00.000Z
author: "001"
tags:
  - AI
  - VS Code
  - GitHub Copilot
  - Kimi K2.6
  - Autonomous Vehicles
  - AI Bias
  - Agentic Coding
  - Tesla FSD
category: "AI News Briefing"
---

## 7 Top Stories

### 1. VS Code Enables 'Co-Authored-by Copilot' by Default, Sparking Backlash
A merged pull request in the VS Code repository changes the `git.addAICoAuthor` setting default from "off" to "all," meaning every commit that includes AI-generated code contributions will automatically receive a `Co-authored-by: Copilot <copilot@github.com>` trailer — with no opt-in required. The change, merged by Microsoft's Cody Webster, has drawn massive criticism on Hacker News, becoming the top story with nearly 1,500 points and over 800 comments. Developers argue that auto-attribution misrepresents their work, creates false provenance records in repositories, and effectively normalizes AI authorship without explicit consent. The backlash reflects a broader tension over how AI-generated code should be tracked and attributed in professional software development.

### 2. DeepClaude Combines Claude Code Agent Loop with DeepSeek V4 Pro
A new open-source project called DeepClaude has gained significant traction on Hacker News with 467 points, combining Claude Code's agentic reasoning loop with DeepSeek's V4 Pro model. The project offers developers an alternative approach to AI-assisted coding that chains Claude's planning capabilities with DeepSeek's code generation. The growing interest reflects the developer community's appetite for composable, multi-model AI workflows rather than single-vendor solutions — and suggests that combining strengths from different frontier models may outperform any single system for complex coding tasks.

### 3. Kimi K2.6 and Chinese Models Dominate AI Coding Contest
In an ongoing AI coding competition, Kimi K2.6 from Chinese startup Moonshot AI won a programming challenge outright with a 7-1-0 record, beating GPT-5.5 (third place), Claude Opus 4.7 (fifth), and Gemini Pro 3.1 (sixth). Xiaomi's MiMo V2-Pro took second place, meaning two Chinese models finished ahead of every Western frontier lab. The Word Gem Puzzle challenge tested real-time decision-making on sliding-tile letter grids, with Kimi winning through an aggressive greedy strategy. While not a definitive benchmark, the results underscore the rapid closing of the gap between Chinese and Western AI models in practical coding tasks, with open-weights models now competing at the frontier.

### 4. "Agentic Coding Is a Trap" Goes Viral
An article titled "Agentic Coding Is a Trap" has surged to 367 points on Hacker News, arguing that the industry's shift toward spec-driven development and AI agent orchestration is creating more problems than it solves. The author highlights several quantifiable trade-offs: increasing system complexity to manage AI non-determinism, atrophying coding skills across all experience levels, vendor lock-in (citing Claude Code outages that have paralyzed entire teams), and fluctuating token costs. The piece points to Anthropic's own research acknowledging a "paradox of supervision" — effectively using AI coding agents requires oversight, but the very skills needed for oversight are eroded by over-reliance on the agents themselves.

### 5. California DMV Announces First-in-Nation Rules to Ticket Driverless Cars
California's Department of Motor Vehicles has announced new autonomous vehicle regulations — described as "the most comprehensive AV regulations in the nation" — that will allow police to issue citations directly to AV manufacturers when their vehicles commit moving violations. The rules take effect July 1 and require AV companies to respond to emergency official calls within 30 seconds, with penalties for vehicles that enter active emergency zones. The announcement follows multiple high-profile incidents, including a Waymo vehicle making an illegal U-turn directly in front of San Bruno police officers who had no way to issue a ticket without a human driver to hand it to, and repeated complaints from the San Francisco Fire Department about robotaxes blocking emergency responses.

### 6. Tesla Owner Wins $10,600 Court Judgment Over Undelivered Full Self-Driving
Ben Gawiser, a Texas Tesla Model 3 owner, won a $10,672.88 small claims judgment after Tesla failed to deliver the Level 5 Full Self-Driving software he paid $10,000 for in 2021. After Tesla ignored the initial lawsuit, a default judgment was issued in Gawiser's favor. Tesla then filed for a deadline extension, claiming it hadn't received notice of the hearing, but provided no substantive defense. Gawiser cited Elon Musk's own Q1 2026 earnings call admission that HW3 vehicles — including Gawiser's — would never achieve the promised autonomy and would require factory-built hardware upgrades. Tesla is still fighting to delay payment despite having no apparent legal defense.

### 7. Research Finds AI Hiring Tools Show 67–82% Self-Preference Bias
A new research paper accepted at EAAMO 2025 and AIES 2025 has found that large language models used in hiring pipelines exhibit strong self-preference bias: they consistently rank resumes generated by themselves higher than equivalent human-written or rival-model-generated resumes. The bias ranges from 67% to 82% across major commercial and open-source models. Simulations of realistic hiring pipelines across 24 occupations show that candidates using the same LLM as the evaluator are 23% to 60% more likely to be shortlisted than equally qualified applicants with human-written resumes, with the largest disadvantages in business fields like sales and accounting. The researchers demonstrated that simple interventions targeting LLM self-recognition can reduce the bias by more than 50%.

---

## Trend Watch

| Domain | Signal | Direction |
|--------|--------|-----------|
| AI Dev Tools | VS Code forces Copilot attribution by default | 🔴 Controversial |
| Model Competition | Chinese models beat Western labs in coding challenge | 🟢 Shifting |
| Autonomous Vehicles | California creates enforcement framework for AV violations | 🟢 Regulating |
| AI Ethics | Hiring AI shows massive self-preference bias | 🔴 Concerning |
| Agentic Coding | Community pushes back on "spec-driven development" hype | 🟡 Debating |

---

## What to Watch

- **VS Code attribution rollback:** The level of community pushback on the auto-attribution change is intense enough that Microsoft may need to reconsider. Watch for a revert PR or a community fork that restores opt-in behavior.
- **AI-AI interaction fairness framework:** The hiring bias paper calls for "expanded frameworks of AI fairness that address not only demographic-based disparities, but also biases in AI-AI interactions." This could become a new subfield of AI ethics research — if both the screener and applicant use AI, whose AI wins?
- **Small claims precedent for FSD refunds:** If Gawiser's judgment holds and other owners follow suit, Tesla could face a wave of small claims lawsuits from the thousands of customers who purchased FSD at $10,000–$15,000. The company's recent pivot to subscription-only FSD makes the refund argument even stronger.
