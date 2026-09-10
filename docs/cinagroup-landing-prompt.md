# CinaGroup landing-page implementation brief

## 可复制提示词（中文）

请将 cinagroup.com 首页升级为精致的深色 React + Tailwind CSS 落地页。以现有 Astro 项目为基础，将交互页面封装在单个 TSX 文件中，并通过服务端渲染与客户端水合接入；不要重建项目或破坏已有产品、法律、联系与博客路由。

品牌使用 CinaGroup，中文译名为“海内集团”；保留英文、简体中文、日文、韩文、俄文、西班牙文、葡萄牙文、法文八种语言。主推 CinaSeek 和 CinaToken。所有发布状态、功能与链接必须来自现有产品资料，不使用 Plety、虚构客户背书、“API 2.0 已发布”或未经证实的语音转写功能。

视觉采用纯黑背景、白色标题、灰色正文、简约几何描边 SVG 标志与衬线斜体强调。内容最大宽度 1280px、水平内边距 24px；首屏标题 48/72px、区块标题 36/48px、正文 16px。主按钮白底黑字，次按钮使用 #1F1F22、悬停 #2A2A2D；按钮为圆角胶囊形。

按以下顺序实现：

1. 固定导航：初始透明，滚动超过 20px 后使用黑色 80% 背景和模糊。提供关于、功能、常见问题、联系锚点，以及语言选择和产品入口。移动菜单平滑展开，选择链接后自动关闭，并支持 Escape。
2. 全屏首屏：使用指定视频与渐变遮罩。徽章改为“CinaSeek · 抢先体验”，标题为“智能层，助力清晰决策。”，最后一个词使用正常字重的衬线斜体。添加两个行动按钮。下方展示“探索海内集团产品生态”，五个真实产品标志重复四组，采用遮罩渐隐和 30 秒无缝跑马灯。
3. CinaSeek：桌面文字在左、视频与玻璃质感界面在右。黄色功能标签，介绍智能体对话、Gadgets 与 Gatekeepers。标签页可以切换，但输入框与图标仅作示意，并清楚标注“界面示意”，不伪装成在线 AI 服务。
4. CinaToken：左右反转，使用绿色标签与指定第三段视频。以波形视觉和 API → CinaToken → LLM 展示模型网关，说明凭据、路由、使用策略和成本边界，不添加虚构性能数字或转写能力。
5. FAQ：最大宽度 768px，透明背景、白色 10% 边框、12px 圆角和分隔线。五个问题涉及集团、开始使用、数据、集成和预览。问题按钮内边距 24px；加号旋转为叉号；回答采用 CSS 网格 0fr/1fr 过渡，并正确设置 ARIA 和隐藏状态。
6. 页脚：复用首屏视频并加强暗色遮罩，设置衬线斜体 CTA、行动按钮和四列链接。使用真实产品、资源/法律及已确认的社交地址。中文版权为“© 2026 CinaGroup。保留所有权利。由CinaGroup制作。基于 Gemini 构建。”，品牌与 Gemini 稍亮。

使用 FadeInUp 封装滚动显现：从向下偏移 40px、透明度 0，以 1000ms 过渡到原位和完全可见。启用全局平滑滚动，但尊重减少动态效果设置。内容在服务端渲染时保持可见。装饰视频静音循环、playsInline、进入视口才加载，离开视口或标签后台时暂停；节省流量及减少动态效果时改用静态背景，并提供暂停动画按钮。

首页按本次设计固定为黑色，不保留无效的主题按钮；其他页面原有明暗模式功能不变。完成后验证桌面、390px/320px 窄屏、八种语言、键盘操作、FAQ、菜单、视频降级、SEO、内部链接及部署构建。视频来源与英文细化规范见下文。

## Optimized prompt

Apply a polished, responsive React + Tailwind landing page to the existing Astro-powered cinagroup.com. Implement the interactive landing page in one TSX file, mounted as a server-rendered, hydrated Astro island. Keep the existing product, legal, contact and multilingual blog routes. Use the existing eight locales: English, Simplified Chinese, Japanese, Korean, Russian, Spanish, Portuguese and French. The Chinese brand name is 海内集团; elsewhere use CinaGroup. Never publish the template name Plety.

Use a pure black background, white headings, gray supporting text, restrained outlined SVG marks, generous spacing and serif italic emphasis. Follow the user’s supplied typography and section spacing: a 1280px content container, 24px gutters, 48/72px hero heading, 36/48px section headings, 16px body copy, rounded pill buttons and 24px media frames. Use a single geometric, outlined interlocking-C brand mark. All text and controls must be code-native, not a screenshot.

Build these sections in order:

1. Fixed responsive navigation. Transparent initially; after 20px scrolling use black at 80% opacity, backdrop blur and z-index 50. Provide About, Features, FAQ and Contact anchors, a locale selector and a primary action. Mobile navigation expands with a smooth grid transition, closes after choosing a link and responds to Escape.
2. Full-height centered hero with an honest “CinaSeek · Early access” badge. English headline: “The intelligent layer. Clarity for every decision.” Chinese: “智能层，助力清晰决策。” Set the final word in a normal-weight italic serif. Describe the real agent workspace and model gateway, with product and feature CTAs. Use the supplied hero video with a dark readability mask. Follow with a seamless 30-second marquee containing four equal groups of the five actual CinaGroup products. Say “Explore the CinaGroup ecosystem”, not “trusted by” fictional customers.
3. CinaSeek feature: left-aligned yellow-accented copy and a right-hand video-backed glass interface. Use the supplied second video. Present accessible Chat/Gadgets/Gatekeepers tabs and an illustrative composer with outlined microphone and waveform icons. Do not collect text or pretend to generate AI responses.
4. CinaToken feature: reverse the desktop columns, with green accents and the supplied third video. Present a model-gateway illustration with an animated waveform motif and API → CinaToken → LLM routing. Explain credentials, routing, usage policies and budget boundaries. Do not claim an unsupported speech-transcription feature or fabricated benchmark. Link to the real product page.
5. Five-item FAQ, 768px maximum width, transparent container, white 10% border, 12px radius and separators. Questions use real buttons with aria-expanded/aria-controls. Rotate plus into a cross. Animate answer rows from 0fr to 1fr; hidden answers must not remain keyboard-focusable. Questions cover the company, getting started, data handling, integrations and whether previews are live.
6. Video-backed footer with centered CTA, serif italic ending, product links, resources/legal links and verified social profiles. Do not invent pricing, changelog, YouTube or LinkedIn destinations. Preserve the requested 2026 CinaGroup/Gemini credit in localized form. Keep legal policies directly reachable.

Use a reusable FadeInUp helper with a 40px upward reveal and 1000ms duration. Server-rendered content must remain visible without JavaScript. Respect reduced-motion, data-saving preferences, offscreen media and background tabs. Provide a motion pause button. Videos are decorative, muted, looping and playsInline; load them only when visible. Retain a static background fallback when unavailable. Enable smooth HTML scrolling, but disable it for reduced-motion users.

The landing page is intentionally fixed-dark, independent of the theme preference used by the rest of the site; do not expose an inert theme switch. Preserve working theme switches on product and blog pages. Keep exact external-video hosts restricted by Content Security Policy. Validate internal links, headings, language metadata, mobile overflow, keyboard focus, tabs, FAQ, locale switching, reduced motion and deployment build gates.

## Video assets supplied by the user

- Hero/footer: `https://cdn.sceneai.art/Hero%20Section%20Video/50b4f304-cdca-4e12-8735-580d225834be.mp4`
- CinaSeek: `https://cdn.sceneai.art/Hero%20Section%20Video/1bcc8fa3-37f6-4c53-8591-0347e4c7f8ac.mp4`
- CinaToken: `https://cdn.sceneai.art/Hero%20Section%20Video/736fd4a0-70ac-4f44-9633-55769ead6aca.mp4`

## Intentional adaptations

- CinaGroup/海内集团 replaces Plety. Existing release status replaces the unsupported API 2.0 announcement.
- Real product discovery replaces invented customer endorsement.
- CinaToken’s documented gateway scope replaces the template’s unverified transcription capability.
- A motion control replaces the old theme switch only on the explicitly black landing page.
- Footer destinations use existing routes and known accounts. Existing multilingual content is preserved.
- The requested custom SVG logo is hand-authored as vector geometry, rather than generated raster artwork.

## Visual reference

A generated full-page concept establishes the black palette, fluid-media framing, centered serif-accent hero, alternating feature rhythm, outlined accordion and four-column footer. User-supplied videos remain the production media; the concept is not embedded as UI.

## Verification and fidelity notes

- Compared the concept and rendered desktop viewport: pure-black canvas, outlined mark, centered two-line hero, italic serif accent and paired pill CTAs retain the intended hierarchy.
- Desktop feature sections retain alternating two-column placement, 64px gaps and framed glass previews. The gateway preview intentionally replaces the concept’s speech-playback mockup to match CinaToken’s documented scope.
- FAQ uses a transparent outlined container, 24px question padding, separators and rotating plus icons; expansion and collapse were checked in the browser.
- Footer retains the four-column rhythm and serif CTA. Verified routes/accounts replace speculative social links.
- A generated 36KB WebP background preserves the fluid silver/violet appearance when reduced motion is enabled or remote video is unavailable. It is a standalone background asset, not a sliced page screenshot.
- Tested 1440px desktop, 390px Chinese mobile and all seven localized routes at 320px. Fixed the waveform’s intrinsic-width overflow; no page-level horizontal overflow remained. Verified one H1 per locale, mobile menu close-on-navigation, accessible tab selection and FAQ state.
- Full-page screenshot stitching in the in-app browser produced duplicated strips, so visual verification used individual viewport/section screenshots plus DOM geometry instead.
- The landing page intentionally follows the user’s fixed-dark design; product and blog pages retain their existing functional theme control.
- Exclude the eight React homepages from secondary HTML compression. Their React text separators, class order and inline style text must survive unchanged; the build audit checks the separators to prevent hydration regressions.
