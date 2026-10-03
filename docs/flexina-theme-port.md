# Flexina appearance port for CinaGroup

The site uses an original Astro implementation of the Flexina visual preset, connected to the existing CinaGroup content and EmDash runtime. This is a presentation change; it does not import a WordPress database or add WooCommerce, newsletter delivery, customer accounts, or demo business claims.

## Sources and rights

- User-selected visual reference: https://preview.desertthemes.com/pro/flexina/ (inspected 2026-10-03). Its deployed theme is Atua Pro with the Flexina preset. The public theme style.css declares GPLv3-or-later. No theme source, scripts, demo photographs, logos, or decorative artwork are redistributed by this implementation.
- User-selected workflow: https://github.com/cinagroup/emdash/tree/main/skills/wordpress-theme-to-emdash, pinned to `4e1b6393d6036e852bfcc494405f8d8eb9f09ddb`. Discovery, design, template conversion, dynamic integration, and verification guidance were read, together with the canonical building-emdash-site skill and querying/rendering/site-feature references.
- CinaBrand assets are the existing authoritative files documented in `docs/cinabrand.md`; their bytes and 832×288 aspect ratio remain unchanged. Header always uses the normal wordmark on cyan, footer the original white wordmark on dark.
- DM Sans Variable and Red Hat Display Variable: Fontsource 5.2.8, SIL OFL 1.1, bundled and served locally. License texts are in `public/images/flexina/*-OFL.txt` and package licenses. These replace Inter for the public site.
- City and office photographs: original OpenAI ImageGen outputs generated for this project on 2026-10-03, encoded to WebP without content edits. They illustrate environments, and do not represent actual CinaGroup offices or employees. Filenames, sizes and SHA256 are recorded in `public/images/flexina/provenance.json`.
- Icons: existing project astro-icon / Tabler dependency. Geometric lines, outlines, slanted areas and footer decoration are original CSS.

Original-photo prompts: a modern international Asian commercial street, cool morning light, tall glass/stone towers, calm left area for white text; and a daylight office with pale oak desks, generic monitors and plants. Both exclude trademarks, signage, identifiable people and text.

## Discovery and design

Reference captures: 1440×900 desktop and 390×844 mobile. Browser automation uses the approved CUA interface. Local frontend verification renders the actual project components in a temporary Astro configuration without the Windows workerd runtime; it does not replace production routes or data.

The selected visual contracts are a full-width two-row header with cyan slanted logo/CTA areas; DM Sans body and Red Hat Display headings; primary #03c2f6 and secondary #42d7ff; 1252px containers; photographic hero with 60% black overlay and a 12-second fading carousel; 100px pill buttons; four numbered cards overlapping the hero by 65px; a photo/text about composition; dashed service-style cards; alternating white/gray sections; numbered workflow circles; cyan CTA band; a dark four-column footer; and centered photographic inner-page title banners.

## Mapping and content boundaries

| WordPress responsibility       | Astro / existing runtime                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Header/footer                  | `components/marketing/Header.astro`, `Footer.astro`, official `Logo.astro`, existing eight-language navigation                  |
| Front page                     | `LocalizedHomePage.astro` and `flexina/HeroSlider.astro`, with existing eight-language business copy                            |
| About/services/product details | Existing page routes and content, shared `CinaPageHero.astro` and theme CSS                                                     |
| Pricing                        | Existing plans and `PricingDisclosure.astro`, restyled `marketing/Pricing.astro`                                                |
| Blog archives and entries      | Existing governed disk archive/CMS public rendering; queries, status/locale filtering and HTMLRewriter markers remain unchanged |
| Forms / plugins                | Existing ContactSubmissionForm and /api/contact; EmDash admin and Access authentication stay intact                             |

The homepage shows all five real products, the existing three-step method and consultation CTA. No demo testimonials, partner logos, personnel, historical timeline, success percentages, sales statistics, store items or fixed subscription prices are published. The original demo's extra sections are omitted where the site has no approved factual content. The homepage does not invent a latest-news section from unverified archives.

## Deliberate visual differences

The official CinaBrand and all business text replace the Flexina wordmark and dummy copy. Original photographs replace unlicensed demo media. The header has only the real social links and email, with no invented telephone, shopping cart, store or fake search. On small screens, numbered cards are horizontally scrollable with scroll snap, so all four remain readable without an unsolicited auto-advancing card carousel. Long localized titles may increase hero height to avoid clipping. Primary cyan buttons use dark text for readable contrast; content links use darker cyan in light mode. Dark mode is an additional supported adaptation. Demo newsletter, player, progress percentages and pricing toggles are omitted because the current business does not provide those functions or values.

## Verification record

Reference/result pairs were inspected at 1440×900 and 390×844. All eight homepages passed light-mode 320/390px and dark-mode 320px checks: one h1, all five products, loaded original photographs and no document overflow. Russian, French, Portuguese and Chinese navigation also passed 1024px checks. About, pricing, contact and CinaSeek passed 320px overflow/heading checks; the contact form still targets /api/contact without submitting a test inquiry. Dark mode persisted through client navigation and reload. Mobile menu/Escape, next/previous keyboard slides, reduced-motion behavior, pause/resume, 133px→80px sticky header and back-to-top were exercised. The first Linux validation (37116506931) passed the actual Worker build/startup, compiled responses and audits for 771 HTML pages / 412 archives; 5 CSS files passed the unchanged 64KiB-per-file budget. The final commit is validated again before release.

Fidelity ledger: (1) cyan #03c2f6 slanted desktop header now measures 133px at 1440px and 240px Logo region; (2) reference typefaces are loaded locally; (3) full-width photo hero, 60% dark overlay, large left-aligned desktop / centered mobile copy and pills match the selected composition; (4) four top-line cards overlap 65px desktop / 55px mobile; (5) about photo/text composition, gray dashed product-card section and numbered circles preserve the reference rhythm; (6) photographic centered inner-page headings and rounded pricing cards replace prior template presentation; (7) dark four-column footer retains official white Logo. Long real copy and photograph/content replacements are deliberate differences, not dummy reference-copy substitutions.

Regression validation: existing source governance, i18n routing, contact tests and CMS/auth tests pass (275/276 CMS/auth tests, one intentional skip). Local changed-file ESLint/Prettier/Astro compiler passes. Windows workerd cannot initialize on this host, so full framework type/build checks use Linux CI. Unchanged files have existing Windows line-ending formatting warnings; no repository-wide formatting rewrite was made.

Styles are served as separate Vite content-hashed URL assets from the canonical base.css/theme.css sources, so added theme CSS does not inflate a single common bundle beyond the existing budget. No security or cache policy was relaxed. Production release evidence is recorded outside tracked source after deployment.
