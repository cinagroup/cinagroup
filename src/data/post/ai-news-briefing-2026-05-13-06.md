---
title: "Musk v. Altman Trial Climax, OpenAI Delays Models, Claude Goes Legal — AI News Briefing"
description: "Sam Altman testifies in the Musk lawsuit as OpenAI's safety committee reveals model release delays, Anthropic plugs Claude into legal workflows, and DeepMind reimagines the mouse pointer for the AI era."
publishDate: 2026-05-12T22:00:00.000Z
author: "001"
tags:
  - AI
  - OpenAI
  - Anthropic
  - Meta
  - Google DeepMind
  - Musk
  - Altman
  - Legal AI
  - Edge AI
  - AI Safety
category: AI News
---

## 🗞️ AI News Briefing — May 13, 2026

---

## Top 7 Stories

### 1. Musk v. Altman Trial Reaches Climactic Testimony

Sam Altman took the stand in Elon Musk's lawsuit against OpenAI, describing Musk's departure from the board as a "morale boost" and testifying that OpenAI has raised approximately $175 billion in investment. Altman recounted the chaotic November 2023 board ousting ("the blip"), saying he was "in a fog of war" as employees began quitting en masse. Cross-examination focused on character attacks — Altman was repeatedly called a liar by Musk's legal team, including by former OpenAI co-founder Ilya Sutskever and Anthropic's Dario and Daniela Amodei. Altman responded with visible confusion, stating, "I believe I am an honest and trustworthy businessperson." The trial also revealed text messages where Musk called the for-profit restructuring a "bait and switch," while Altman countered that he had offered Musk equity when the profit cap was established.

### 2. OpenAI's Safety Committee Formally Delayed Model Releases

Dr. Jeremy "Zico" Kolter, chair of OpenAI's board-level safety and security committee, revealed that the committee has "formally requested a delay of models" on two occasions. Kolter also outlined OpenAI's safety structure, which spans roughly 200 employees across the safety systems team (guardrails and evaluations), preparedness team, alignment team, model policy team, and investigations. When questioned about the controversial dissolution of OpenAI's superalignment and AGI readiness teams in 2024, Kolter said some of that research continues within other teams. This marks the most detailed public account of OpenAI's internal safety governance.

### 3. Anthropic Connects Claude to Legal Industry Tools

Anthropic announced that Claude can now integrate directly with major legal industry platforms including DocuSign, Box, Thomson Reuters, and Harvey AI. The integration allows Claude to review contracts, surface case law, and draft legal documents within the tools law firms already use. The move signals accelerating AI adoption in the legal sector, where Anthropic is competing to become the standard AI interface for legal professionals. LexisNexis has also been exploring AI-powered legal interviews, suggesting the legal AI market is reaching an inflection point.

### 4. Meta AI App Gets "Live AI" — Real-Time Camera Answers

Meta rolled out a "live AI" feature in its AI app that lets users point their phone camera at objects and receive real-time answers and visual overlays. The feature combines vision models with live camera input, enabling a more interactive, point-and-ask experience. Meta also introduced "Muse Spark," a model that lets users "talk naturally" within the app. Additionally, Meta announced its Connect developer conference for September 23–24, promising "the first glimpse of what's coming to the next computing platform" with updates on VR, wearables, the metaverse, and AI.

### 5. Cactus Open-Sources Needle: A 26M Parameter Function-Calling Model

Cactus Compute released Needle, a 26M parameter function-calling model distilled from Gemini that runs at 6,000 tokens/s prefill and 1,200 tokens/s decode on consumer devices. The model uses a novel "Simple Attention Networks" architecture with no MLP layers — just attention and gating — based on the finding that tool calling is fundamentally retrieval-and-assembly, not reasoning. Needle outperforms FunctionGemma-270M, Qwen-0.6B, Granite-350M, and LFM2.5-350M on single-shot function calling benchmarks. The team argues that massive models are overkill for agentic tool use on edge devices like phones, watches, and glasses.

### 6. Google DeepMind Proposes a New Mouse Pointer for the AI Era

Google DeepMind published a blog post exploring how the traditional mouse pointer should evolve in an AI-assisted computing environment. As AI agents increasingly participate in screen interactions, DeepMind argues that the cursor metaphor needs rethinking to accommodate shared control between humans and AI systems. The proposal addresses a growing UX challenge as agentic AI tools like Claude Code, Cursor, and Devin take on more autonomous screen and code manipulation tasks.

### 7. Statewright: State Machines Make Small AI Agents Reliable

Former NVIDIA and AMD Distinguished Engineer Ben Cochran launched Statewright, a framework that constrains AI agents using formal state machines to improve reliability. Instead of relying on bigger models, Statewright defines which tools a model can access, how many iterations it gets, and what transitions are valid at each step — enforced by a Rust engine, not prompts. The approach improved performance across model families (Qwen-Coder, GPT-OSS, Gemma 4) above the 13B parameter threshold, and even boosted frontier models like Haiku, Sonnet, and Opus with fewer tokens and fewer "death spirals." The tool integrates with Claude Code via MCP and is available with a free tier.

---

## 📊 Trend Watch

| Domain | Signal | Direction |
|---|---|---|
| **AI Governance** | OpenAI's safety committee actively blocks model releases; trial exposes internal tensions | 🔴 Hot |
| **Edge AI** | 26M parameter model outperforms 350M+ rivals on function calling; runs on consumer hardware | 🟢 Rising |
| **Legal AI** | Anthropic, LexisNexis race to embed AI in legal workflows (DocuSign, Thomson Reuters, Harvey) | 🟢 Rising |
| **Agent Reliability** | State machines, constrained tool spaces replace prompt engineering for agent stability | 🟢 Rising |
| **AI Hardware** | Meta Connect teases "next computing platform"; Googlebook hints at AI-native laptops | 🟡 Emerging |

---

## 👀 What to Watch

- **Musk v. Altman verdict timeline** — The trial is generating daily testimony that could reshape how AI company governance and founder disputes are handled legally. Watch for closing arguments and the judge's rulings on key evidentiary disputes.
- **OpenAI model release schedule** — With the safety committee now publicly acknowledging model delays, expect heightened scrutiny on when and how GPT-5 and future models ship. The interplay between safety governance and product timelines will be a key tension.
- **Meta Connect 2026** — Set for September 23–24, Meta's promise of a "next computing platform" reveal suggests major hardware announcements — potentially AI-native wearables or AR glasses that build on the Live AI camera feature.
