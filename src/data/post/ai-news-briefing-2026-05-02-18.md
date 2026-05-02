---
title: "Eka Robotics Signals a 'ChatGPT Moment' for Robot Dexterity, Liquid AI Drops 24B MoE Model for Edge"
description: "A Cambridge startup's robot claw can now screw in a light bulb — naturally. Plus: Musk v. OpenAI reveals Nvidia supercomputer giveaway and Gabe Newell emails, US government drops Anthropic from classified AI contracts, and a new 24B-parameter open model fits in 32GB RAM."
publishDate: 2026-05-02T10:00:00.000Z
author: "001"
tags:
  - AI News
  - Robotics
  - Eka
  - Liquid AI
  - OpenAI
  - Elon Musk
  - Anthropic
  - Edge AI
category: "AI News Briefing"
---

## AI News Briefing — May 2, 2026 (18:00 CST)

---

### 7 Top Stories

**1. Eka Robotics' Robot Claw Can Screw in a Light Bulb — WIRED Calls It a 'ChatGPT Moment' for Robotics**

Eka, a Cambridge-based startup co-founded by MIT professor Pulkit Agrawal and ex-Google DeepMind researcher Tuomas Haarnoja, demonstrated a robot arm that can gently pick up, chase, and screw in a light bulb — a task no existing commercial robot arm can perform. WIRED's robotics correspondent described the experience as reminiscent of trying ChatGPT for the first time, noting the robot moves with an unprecedented fluidity. Eka's approach combines reinforcement learning with improved sim-to-real transfer, closing the simulation gap that derailed earlier efforts like OpenAI's Dactyl project. The founders believe they're halfway to solving general-purpose dexterity, and that scaling their approach could "revolutionize how robots are used" beyond factories into shops, restaurants, and homes. "Trillions of dollars flow through the human hand," Agrawal says. The story hit 143 points on Hacker News with 195 comments, reflecting broad excitement about the demo.

**2. Musk v. OpenAI: New Evidence Reveals Nvidia's Supercomputer Gift, Gabe Newell Emails, and 'Freemind' Name**

The latest batch of exhibits from the Musk v. OpenAI trial revealed that Nvidia CEO Jensen Huang gave OpenAI an in-demand supercomputer in the company's early days. Email exchanges also surfaced between Musk and Valve founder Gabe Newell discussing a SpaceX tour and OpenAI introduction for game designer Hideo Kojima. Musk wrote to Newell in November 2018 that his involvement in OpenAI was "very limited at this point" and that he'd lost confidence in OpenAI competing with Google/DeepMind, deciding to pursue that competition through Tesla instead. Perhaps most colorfully, Musk's first proposed name for the AI lab was "Freemind," meant to convey the creation of "digital minds" for broad human benefit. The evidence dump also included Musk's early draft of OpenAI's mission statement and his heavy influence on the lab's initial governance structure.

**3. Liquid AI Releases LFM2-24B-A2B: A 24B-Parameter MoE Model That Fits in 32GB RAM**

Liquid AI has released LFM2-24B-A2B, its largest Mixture of Experts model yet, with 24 billion total parameters but only 2.3 billion active per forward pass. The key innovation: it's designed to fit in 32GB of RAM, making it deployable on consumer laptops with integrated GPUs and dedicated NPUs. The model uses a hybrid architecture combining gated short convolution blocks with grouped query attention, developed through hardware-in-the-loop architecture search. On a single H100 GPU with vLLM, it achieves approximately 26.8K total tokens per second at 1,024 concurrent requests — surpassing comparably sized MoE models like Qwen3-30B-A3B and gpt-oss-20b. The model is open-weight and available on Hugging Face with day-one support for llama.cpp, vLLM, and SGLang, including multiple quantization options.

**4. US Government Drops Anthropic from Classified AI Contracts, Pivots to Competitors**

The US government has removed Anthropic from its roster of approved vendors for handling classified information, shifting those contracts toward competing AI labs including OpenAI. This marks a significant setback for Anthropic, which had previously been trusted with sensitive government work. The move raises questions about whether national security procurement decisions are being influenced by political factors, particularly given Anthropic's leadership — CEO Dario Amodei was recently characterized as an "ideological lunatic" by Defense Secretary Pete Hegseth. The decision could reshape the competitive landscape among AI labs vying for lucrative government contracts, which represent a significant revenue stream for companies building large-scale AI infrastructure.

**5. Early OpenAI Emails Reveal Governance Tensions and 'Second Key' Safety Plans**

Emails released as part of the Musk v. OpenAI discovery process paint a detailed picture of the company's founding tensions. Altman proposed a five-person governance board (himself, Musk, Bill Gates, Pierre Omidyar, and Dustin Moskovitz) and suggested creating a "second key" safety mechanism where the board would approve any potentially dangerous AI releases. Musk's November 2015 emails reveal he wanted to create an "independent, pure play 501c3, but with a crystal clear focus on the positive advent of strong AI distributed widely to humanity." He also offered "insane amounts of real world sensor data" from Tesla, claiming it was "several orders of magnitude greater than any other company." The emails show Musk was deeply involved in early governance design but grew uncomfortable with the direction by 2018, when he told Altman that OpenAI looked "hypocritical" after its Microsoft deal.

**6. The Verge: Is AI Homogenizing Fashion Design?**

A new Verge video essay argues that AI is playing a significant role in why fashion brands are losing their unique identities. The piece points to AI design tools, trend-scraping algorithms, and the fast fashion pipeline as a convergence that's producing increasingly similar clothing across brands. AI-powered trend detection tools can identify what's popular on social media and feed that data directly to manufacturers, creating a feedback loop where every brand chases the same micro-trends simultaneously. The argument extends beyond the internet into physical retail — "slop is no longer just limited to the internet," the piece suggests. This raises broader questions about AI's role in creative homogenization, parallel to concerns about AI-generated content in writing, music, and visual art.

**7. Musk's Money Manager Testifies He Was a 'Super Fan of Capitalism' in Courtroom Comedy Moment**

In one of the more colorful moments of the Musk v. OpenAI trial, Jared Birchall — Musk's financial manager who runs the Excession family office — reviewed the OpenAI for-profit term sheet and wrote to Shivon Zilis: "Pretty plain vanilla for-profit structure. So kinda hard to push a narrative that doesn't involve investors being very focused on ROI. I'm a super fan of capitalism and making tons of money doing great things but not sure if this correlates with the 'noble cause for humanity, not doing it to make money' narrative. Did he/would he [Altman] offer E a board seat?" The email, entered into evidence, cuts directly to the heart of Musk's claim that OpenAI abandoned its nonprofit mission — suggesting Birchall himself saw the structure as standard for-profit terms. The judge also quipped at Musk during cross-examination: "Let's remind everyone you are not a lawyer and you've never taken a class in evidence."

---

### Trend Watch

| Domain | Trend | Signal |
|--------|-------|--------|
| **Robotics & Embodied AI** | Dexterity breakthrough at startup scale | Eka's demo shows sim-to-real gap is closing — the physical intelligence era may be starting |
| **Open-Weight Models** | Large models going edge-friendly | Liquid AI's 24B MoE in 32GB RAM signals the "run it locally" movement maturing |
| **AI in Government** | Political influence on procurement | Anthropic's removal from classified contracts raises questions about politicization |
| **Creative Industries** | AI-driven homogenization spreading | Fashion joins music and writing as industries grappling with AI's leveling effect |
| **AI Legal Battles** | Trial evidence reshaping narratives | Internal emails and financial documents are making the case for and against both sides |

---

### What to Watch

- **Eka Robotics funding and scaling** — If Eka can prove their dexterity approach scales beyond lab demos, expect a flood of investment into embodied AI startups. The "ChatGPT moment" comparison sets a high bar.
- **Government AI contract realignment** — Anthropic's exclusion from classified work may trigger competitive repositioning among all major AI labs. Watch for similar moves at other agencies.
- **Liquid AI's edge deployment trajectory** — LFM2-24B-A2B targeting consumer hardware is a bold bet on on-device AI. If hardware partners deliver NPU support as promised, it could accelerate the shift away from cloud-only models.
